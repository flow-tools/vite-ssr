import React, { ReactElement } from 'react'
// Namespace import: `renderToReadableStream` only exists in React 19's
// Node build, and a missing named export would fail to load on React 18.
import * as ReactDOMServer from 'react-dom/server'
import { HelmetProvider } from 'react-helmet-async'
import { StaticRouter, StaticRouterProps } from 'react-router'
import ssrPrepass from 'react-ssr-prepass'
import coreViteSSR from '../core/entry-server.js'
import { getFullPath, withoutSuffix } from '../utils/route.js'
import type { Context, SsrHandler } from './types'
import { createRouter } from './utils.js'

import { provideContext } from './components.js'
export { ClientOnly, useContext } from './components.js'

const isReact19 = Number.parseInt(React.version) >= 19

// React 19: react-ssr-prepass no longer works, so React itself
// waits for every Suspense boundary before the HTML is taken.
async function renderToStringAllReady(app: ReactElement) {
  const stream = await ReactDOMServer.renderToReadableStream(app)
  await stream.allReady
  return new Response(stream).text()
}

// React 19 renders <title>, <meta> and <link> (and the <style> and
// <script> elements it can hoist) itself and, when the render does not
// include <html>, writes them first. They belong in the document head.
// react-helmet-async 3 relies on this on React 19 instead of its context.
const hoistedTagRE =
  /^(?:<title(?![^>]*\bitemprop=)[^>]*>[\s\S]*?<\/title>|<(?:meta|link)\b(?![^>]*\bitemprop=)[^>]*>|<style\b[^>]*\bdata-precedence=[^>]*>[\s\S]*?<\/style>|<script\b[^>]*\basync\b[^>]*>[\s\S]*?<\/script>)/

function splitHoistedTags(html: string) {
  let head = ''
  let match
  while ((match = html.match(hoistedTagRE))) {
    head += match[0]
    html = html.slice(match[0].length)
  }

  return { head, body: html }
}

const render: (component: ReactElement) => string | Promise<string> = isReact19
  ? renderToStringAllReady
  : ReactDOMServer.renderToString

// Apollo's `useQuery` does not suspend, so on React 18 Apollo's own
// renderer awaits its queries. On React 19, `render` already waits for
// Suspense (which `useSuspenseQuery` uses), and Apollo's renderer
// would not wait for lazy routes.
const apolloRender: Promise<typeof render | undefined> | undefined =
  __USE_APOLLO_RENDERER__ && !isReact19
    ? import('@apollo/client/react/ssr')
        .then((apollo) => apollo.renderToStringWithData)
        .catch(() => undefined)
    : undefined

let warnedPrepassVisitor = false

const viteSSR: SsrHandler = function (
  App,
  {
    routes,
    base,
    suspenseFallback,
    prepassVisitor,
    PropsProvider,
    pageProps,
    styleCollector,
    ...options
  },
  hook
) {
  return coreViteSSR(options, async (ctx, { isRedirect, ...extra }) => {
    const context = ctx as Context
    context.router = createRouter({
      routes,
      base,
      initialState: (extra.initialState as Record<string, unknown>) || null,
      pagePropsOptions: pageProps,
      PropsProvider,
    })

    if (hook) {
      context.initialState = (await hook(context)) || context.initialState
    }

    if (isRedirect()) return {}

    const routeBase = base && withoutSuffix(base(context), '/')
    const fullPath = getFullPath(context.url, routeBase)
    const helmetContext: Record<string, Record<string, string>> = {}

    let app: ReactElement = React.createElement(
      HelmetProvider,
      { context: helmetContext },
      React.createElement(
        StaticRouter as React.FunctionComponent<StaticRouterProps>,
        { basename: routeBase, location: fullPath },
        // Same Suspense boundary as entry-client, or hydration fails
        // and React replaces the server HTML.
        React.createElement(
          React.Suspense,
          { fallback: suspenseFallback || '' },
          provideContext(React.createElement(App, context), context)
        )
      )
    )

    const styles = styleCollector && (await styleCollector(context))
    if (styles) {
      app = styles.collect(app)
    }

    if (!isReact19) {
      await ssrPrepass(app, prepassVisitor)
    } else if (prepassVisitor && !warnedPrepassVisitor) {
      warnedPrepassVisitor = true
      console.warn('[vite-ssr] `prepassVisitor` is not supported on React 19')
    }

    const html = await ((await apolloRender) || render)(app)
    const { head: hoistedTags, body } = isReact19
      ? splitHoistedTags(html)
      : { head: '', body: html }

    if (isRedirect()) {
      styles && styles.cleanup && styles.cleanup()
      return {}
    }

    const currentRoute = context.router.getCurrentRoute()
    if (currentRoute) {
      Object.assign(
        context.initialState || {},
        (currentRoute.meta || {}).state || {}
      )
    }

    const {
      htmlAttributes: htmlAttrs = '',
      bodyAttributes: bodyAttrs = '',
      ...tags
    } = helmetContext.helmet || {}

    const styleTags: string = (styles && styles.toString(body)) || ''
    styles && styles.cleanup && styles.cleanup()

    const headTags =
      hoistedTags +
      Object.keys(tags)
        .map((key) => (tags[key] || '').toString())
        .join('') +
      '\n' +
      styleTags

    return { body, headTags, htmlAttrs, bodyAttrs }
  })
}

export default viteSSR
