import { build, InlineConfig, ResolvedConfig, mergeConfig } from 'vite'
import replace from '@rollup/plugin-replace'
import { promises as fs } from 'fs'
import path from 'path'
import {
  getEntryPoint,
  getPluginOptions,
  INDEX_HTML,
  resolveViteConfig,
  BuildOptions,
} from '../config.js'
import type { RollupOutput, OutputAsset, OutputOptions } from 'rollup'

export default async (
  inlineBuildOptions: BuildOptions = {},
  _viteConfig?: ResolvedConfig
) =>
  new Promise(async (resolve) => {
    const viteConfig = _viteConfig || (await resolveViteConfig())

    const distDir =
      viteConfig.build?.outDir ?? path.resolve(process.cwd(), 'dist')

    const { input: inputFilePath = '', build: pluginBuildOptions = {} } =
      getPluginOptions(viteConfig)

    const defaultFilePath = path.resolve(viteConfig.root, INDEX_HTML)
    const inputFileName = inputFilePath.split('/').pop() || INDEX_HTML

    let indexHtmlTemplate = ''

    const clientBuildOptions = mergeConfig(
      {
        build: {
          outDir: path.resolve(distDir, 'client'),
          ssrManifest: true,
          emptyOutDir: false,

          // Custom input path
          rollupOptions:
            inputFilePath && inputFilePath !== defaultFilePath
              ? {
                  input: inputFilePath,
                  plugins: [
                    inputFileName !== INDEX_HTML && {
                      name: 'vite-ssr:rename-index-html',
                      generateBundle(options, bundle) {
                        // Rename custom name to index.html. Re-emit the asset
                        // instead of assigning to `bundle`: Rolldown (Vite 8)
                        // ignores assignments to the bundle object.
                        const htmlAsset = bundle[inputFileName]
                        if (htmlAsset?.type !== 'asset') return
                        delete bundle[inputFileName]
                        this.emitFile({
                          type: 'asset',
                          fileName: INDEX_HTML,
                          source: htmlAsset.source,
                        })
                      },
                    },
                  ],
                }
              : {},
        },
      } as InlineConfig,
      mergeConfig(
        pluginBuildOptions.clientOptions || {},
        inlineBuildOptions.clientOptions || {}
      )
    ) as NonNullable<BuildOptions['clientOptions']>

    const serverBuildOptions = mergeConfig(
      {
        publicDir: false, // No need to copy public files to SSR directory
        build: {
          outDir: path.resolve(distDir, 'server'),
          // The plugin is already changing the vite-ssr alias to point to the server-entry.
          // Therefore, here we can just use the same entry point as in the index.html
          ssr: await getEntryPoint(viteConfig),
          emptyOutDir: false,
          rollupOptions: {
            plugins: [
              replace({
                preventAssignment: true,
                values: {
                  __VITE_SSR_HTML__: () => indexHtmlTemplate,
                },
              }),
            ],
          },
        },
      } as InlineConfig,
      mergeConfig(
        pluginBuildOptions.serverOptions || {},
        inlineBuildOptions.serverOptions || {}
      )
    ) as NonNullable<BuildOptions['serverOptions']>

    const clientResult = await build(clientBuildOptions)

    // With `build.watch`, Vite returns a watcher instead of the output:
    // Rollup's (Vite 6/7) or Rolldown's (Vite 8). Both have `on`.
    if ('on' in clientResult) {
      let resolved = false

      clientResult.on('event', async (event) => {
        // Vite itself closes `event.result` and logs build errors.
        if (event.code !== 'BUNDLE_END') return

        // This piece runs everytime there is
        // an updated frontend bundle.

        // Re-read the index.html in case it changed.
        // This content is not included in the virtual bundle.
        indexHtmlTemplate = await fs.readFile(
          (clientBuildOptions.build?.outDir as string) + `/${INDEX_HTML}`,
          'utf-8'
        )

        // Build SSR bundle with the new index.html
        const serverResult = await build(serverBuildOptions)
        await generatePackageJson(
          viteConfig,
          clientBuildOptions,
          serverBuildOptions,
          serverResult
        )

        if (!resolved) {
          resolve(null)
          resolved = true
        }
      })
    } else {
      // This is a normal one-off build.
      // Vite 6/7 return Rollup output, Vite 8 returns Rolldown output:
      // both have the same `output` shape.
      const clientOutputs = (
        Array.isArray(clientResult)
          ? clientResult
          : [clientResult]
      ).flatMap((result) => (result as unknown as RollupOutput).output)

      // Get the index.html from the resulting bundle.
      indexHtmlTemplate = (
        clientOutputs.find(
          (file) => file.type === 'asset' && file.fileName === INDEX_HTML
        ) as OutputAsset
      )?.source as string

      const serverResult = await build(serverBuildOptions)

      // index.html file is not used in SSR and might be
      // served by mistake.
      // Let's remove it unless the user overrides this behavior.
      if (!pluginBuildOptions.keepIndexHtml) {
        await fs
          .unlink(
            path.join(clientBuildOptions.build?.outDir as string, 'index.html')
          )
          .catch(() => null)
      }

      await generatePackageJson(
        viteConfig,
        clientBuildOptions,
        serverBuildOptions,
        serverResult
      )

      resolve(null)
    }
  })

async function generatePackageJson(
  viteConfig: ResolvedConfig,
  clientBuildOptions: InlineConfig,
  serverBuildOptions: NonNullable<BuildOptions['serverOptions']>,
  serverResult: unknown
) {
  if (serverBuildOptions.packageJson === false) return

  const outputFile = (
    serverBuildOptions.build?.rollupOptions?.output as OutputOptions
  )?.file

  const ssrOutput = path.parse(
    outputFile ||
      ((viteConfig.build?.ssr || serverBuildOptions.build?.ssr) as string)
  )

  // ESM unless the Rollup output format says otherwise (Vite 5 removed `ssr.format`)
  const moduleFormat =
    (viteConfig.build?.rollupOptions?.output as OutputOptions)?.format ||
    (serverBuildOptions.build?.rollupOptions?.output as OutputOptions)?.format

  const isESM = !moduleFormat || moduleFormat === 'es' || moduleFormat === 'esm'

  // The entry file as the build wrote it. Its extension depends on the
  // app's package.json "type": `main.js` with "module", else `main.mjs`.
  const entryFileName = (
    Array.isArray(serverResult) ? serverResult : [serverResult]
  )
    .flatMap((result) => (result as RollupOutput | undefined)?.output || [])
    .find((file) => file.type === 'chunk' && file.isEntry)?.fileName

  const packageJson = {
    main:
      entryFileName ||
      (outputFile ? ssrOutput.base : ssrOutput.name + (isESM ? '.mjs' : '.js')),
    type: isESM ? 'module' : 'commonjs',
    ssr: {
      // This can be used later to serve static assets
      assets: (
        await fs.readdir(clientBuildOptions.build?.outDir as string)
      ).filter((file) => !/(index\.html|manifest\.json)$/i.test(file)),
    },
    ...(serverBuildOptions.packageJson || {}),
  }

  await fs.writeFile(
    path.join(serverBuildOptions.build?.outDir as string, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf-8'
  )
}
