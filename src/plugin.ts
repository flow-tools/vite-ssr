import type { Plugin, UserConfig } from 'vite'
import type { ViteSsrPluginOptions } from './config'
import type { SsrOptions } from './dev/server'
import { createSSRDevHandler } from './dev/server.js'
import { normalizePath, version as viteVersion } from 'vite'
import { createRequire } from 'node:module'
import path from 'node:path'

const pluginName = '@flowtools/vite-ssr'
const entryServer = '/entry-server.js'
const entryClient = '/entry-client.js'

export default function ViteSsrPlugin(
  options: ViteSsrPluginOptions & SsrOptions = {}
) {
  let detectedLib: 'core' | 'vue' | 'react'
  const nameToMatch = options.plugin || pluginName
  const autoEntryRE = new RegExp(`${nameToMatch}(\/core|\/vue|\/react)?$`)

  const plugins = [
    {
      name: pluginName,
      enforce: 'pre',
      viteSsrOptions: options,
      config(config, env) {
        const plugins = config.plugins as Plugin[]
        const isVue = hasPlugin(plugins, 'vite:vue')
        const isReact =
          hasPlugin(plugins, 'vite:react') ||
          hasPlugin(plugins, 'react-refresh')

        detectedLib = isVue ? 'vue' : isReact ? 'react' : 'core'

        const detectedFeats = {
          ...(isReact &&
            detectReactConfigFeatures(options.features, config.root)),
        }

        return {
          ...detectedFeats,
          define: {
            ...detectedFeats.define,
            __CONTAINER_ID__: JSON.stringify(options.containerId || 'app'),
            __BODY_TELEPORTS_ID__: JSON.stringify(options.bodyTeleportsId || 'teleports'),
            // Vite 2.6.0 bug: use this
            // instead of import.meta.env.DEV
            __VITE_SSR_DEV__: env.mode !== 'production',
          },
          ssr: {
            ...detectedFeats.ssr,
            // react-helmet-async 2 only ships CommonJS that Node can't read
            // named exports from, so the ESM server bundle failed to import
            // it. Bundling it uses its ESM build instead.
            noExternal: isReact
              ? [pluginName, 'react-helmet-async']
              : [pluginName],
            // Vite 6 resolves SSR externals without the `module-sync`
            // condition (Vite 7+ adds it), so in dev React Router 7 loads
            // as CommonJS and its named exports fail to import.
            ...(isReact &&
              Number.parseInt(viteVersion) < 7 && {
                resolve: { externalConditions: ['node', 'module-sync'] },
              }),
          },
          server:
            // Avoid displaying 'localhost' in terminal in MacOS:
            // https://github.com/vitejs/vite/issues/5605
            process.platform === 'darwin'
              ? {
                  host: config.server?.host || '127.0.0.1',
                }
              : undefined,
        }
      },
      configResolved: (config) => {
        const libPath = `/${detectedLib}`

        // @ts-ignore
        config.optimizeDeps = config.optimizeDeps || {}
        config.optimizeDeps.include = config.optimizeDeps.include || []
        config.optimizeDeps.include.push(
          nameToMatch + libPath + entryClient,
          nameToMatch + libPath + entryServer
        )

        if (detectedLib === 'react') {
          fixReactDeps(config, libPath)
        }
      },
      async configureServer(server) {
        if (process.env.__DEV_MODE_SSR) {
          const handler = createSSRDevHandler(server, options)
          return () => server.middlewares.use(handler)
        }
      },

      // Implement auto-entry using virtual modules:
      resolveId(source, importer, options) {
        // The Vue entry only imports the deprecated `@unhead/ssr` for
        // unhead 1 and 2. unhead 3 apps may not have it installed, so
        // leave it external instead of failing the build.
        if (source === '@unhead/ssr' && importer?.includes(nameToMatch)) {
          return this.resolve(source, importer, {
            ...options,
            skipSelf: true,
          }).then((resolved) => resolved || { id: source, external: true })
        }

        if (source.includes(nameToMatch)) {
          source = normalizePath(source)
          if (autoEntryRE.test(source)) {
            return `virtual:${source}/index.js`
          }
        }
      },
      load(id, options) {
        if (id.startsWith(`virtual:${nameToMatch}`)) {
          id = normalizePath(id)
          let [, , lib = ''] = id.split('/')
          if (lib === 'index.js') {
            lib = detectedLib
          }

          const libPath = `'${nameToMatch}/${lib}/entry-${
            options?.ssr ? 'server' : 'client'
          }'`

          return `export * from ${libPath}; export { default } from ${libPath}`
        }
      },
    },
  ] as Array<Plugin & Record<string, any>>

  if ((options.excludeSsrComponents || []).length > 0) {
    plugins.push({
      name: pluginName + '-exclude-components',
      enforce: 'pre',
      resolveId(source, importer, ...rest) {
        // @ts-ignore
        const ssr = rest[1] || rest[0]?.ssr // API changed in Vite 2.7 https://github.com/vitejs/vite/pull/5294

        if (
          ssr &&
          options.excludeSsrComponents!.some((re) => re.test(source))
        ) {
          return this.resolve(
            `${pluginName}/${detectedLib}/ssr-component-mock`,
            importer,
            { skipSelf: true }
          )
        }
      },
    })
  }

  return plugins
}

function hasPlugin(plugins: Plugin[] | Plugin[][] = [], name: string): boolean {
  return !!plugins.flat().find((plugin) => (plugin.name || '').startsWith(name))
}

// Resolves from the app's root, like the app's own imports.
// (`require` doesn't exist in this ES module.)
function hasDependency(dependency: string, root = process.cwd()) {
  try {
    createRequire(path.resolve(root, 'package.json')).resolve(dependency)
    return true
  } catch (error) {
    return false
  }
}

function detectReactConfigFeatures(
  features: ViteSsrPluginOptions['features'] = {},
  root?: string
) {
  const external = []
  let useApolloRenderer

  // TODO use virtual modules for feature-detection

  if (hasDependency('@apollo/client/react/ssr', root)) {
    useApolloRenderer = features.reactApolloRenderer !== false
  } else {
    external.push('@apollo/client')
  }

  return {
    ssr: { external },
    define: {
      __USE_APOLLO_RENDERER__: !!useApolloRenderer,
    },
  }
}

// FIXME
// Vite 2.6.0 introduced a bug where `import.meta` is not populated
// correctly in optimized dependencies. At the same time, all the
// subdependencies in Style Collectors must be optimized.
function fixReactDeps(
  config: Pick<UserConfig, 'optimizeDeps' | 'root'>,
  libPath: string
) {
  const styleCollectorDeps = {
    'styled-components': ['styled-components'],
    'material-ui-core-v4': ['@material-ui/core/styles'],
    emotion: ['@emotion/cache', '@emotion/react'],
  } as const

  const styleCollectors = Object.keys(styleCollectorDeps).filter((sc) => {
    try {
      require.resolve(sc)
      return true
    } catch (error) {
      return false
    }
  })

  if (config.optimizeDeps) {
    config.optimizeDeps.include?.push(
      ...styleCollectors.flatMap(
        (sc) => styleCollectorDeps[sc as keyof typeof styleCollectorDeps]
      )
    )

    config.optimizeDeps.exclude = config.optimizeDeps.exclude || []
    config.optimizeDeps.exclude.push(
      ...styleCollectors.map(
        (sc) => pluginName + libPath + '/style-collectors/' + sc
      )
    )
  }
}
