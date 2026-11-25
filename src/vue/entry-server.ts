import { createApp } from 'vue'
// From `vue` itself, so the renderer always matches the app's Vue version
import { renderToString } from 'vue/server-renderer'
import { createRouter, createMemoryHistory, RouteRecordRaw } from 'vue-router'
import { getFullPath, withoutSuffix } from '../utils/route.js'
import { addPagePropsGetterToRoutes } from './utils.js'
import coreViteSSR from '../core/entry-server.js'
import type { SsrHandler } from './types'

import { provideContext } from './components.js'
export { ClientOnly, useContext } from './components.js'

export const viteSSR: SsrHandler = function viteSSR(
  App,
  {
    routes,
    base,
    routerOptions = {},
    pageProps = { passToPage: true },
    ...options
  },
  hook
) {
  if (pageProps && pageProps.passToPage) {
    addPagePropsGetterToRoutes(routes)
  }

  return coreViteSSR(options, async (context, { isRedirect, ...extra }) => {
    const app = createApp(App)

    const routeBase = base && withoutSuffix(base(context), '/')
    const router = createRouter({
      ...routerOptions,
      history: createMemoryHistory(routeBase),
      routes: routes as RouteRecordRaw[],
    })

    router.beforeEach((to) => {
      to.meta.state = extra.initialState || null
    })

    provideContext(app, context)

    const fullPath = getFullPath(context.url, routeBase)

    const { head } =
      (hook &&
        (await hook({
          app,
          router,
          initialRoute: router.resolve(fullPath),
          ...context,
        }))) ||
      {}

    app.use(router)
    router.push(fullPath)

    await router.isReady()

    if (isRedirect()) return {}

    Object.assign(
      context.initialState || {},
      (router.currentRoute.value.meta || {}).state || {}
    )

    const body = await renderToString(app, context)
    
    // @ts-ignore
    const bodyTeleports = context.teleports ? context.teleports[`#${__BODY_TELEPORTS_ID__}`] : null

    if (isRedirect()) return {}

    const {
      headTags = '',
      bodyTags = '',
      bodyTagsOpen = '',
      htmlAttrs = '',
      bodyAttrs = '',
    } = head ? await renderHead(head) : {}

    return { body, headTags, bodyTags, bodyTagsOpen, htmlAttrs, bodyAttrs, bodyTeleports }

  })
}

// unhead 3 server heads render themselves. unhead 1 and 2 need
// `@unhead/ssr`, which unhead 3 deprecates (it warns when imported),
// so it is only loaded for those versions.
async function renderHead(head: object) {
  const { render } = head as { render?: () => Promise<Record<string, string>> }
  if (typeof render === 'function') return render.call(head)

  const { renderSSRHead } = await import('@unhead/ssr')
  return renderSSRHead(head as Parameters<typeof renderSSRHead>[0])
}

export default viteSSR
