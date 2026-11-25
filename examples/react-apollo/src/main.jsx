import App from './App'
import { routes } from './routes'
import viteSSR from '@flowtools/vite-ssr'
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client'

export default viteSSR(App, { routes }, (context) => {
  const { url, isClient, initialState } = context

  // Create a new Apollo cache and client (once per request)
  // and make them available in the App function context.
  // Creating the client here, outside of the app's Suspense
  // boundary, keeps it while queries suspend.
  const cache = new InMemoryCache()
  context.apolloClient = new ApolloClient({
    link: new HttpLink({
      uri: `${isClient ? '' : url.origin}/graphql`,
      credentials: 'same-origin',
    }),
    ssrMode: !isClient,
    cache,
  })

  // Sync initialState and Apollo cache
  if (import.meta.env.SSR) {
    // Placeholder for the SSR state
    initialState.apolloState = { toJSON: () => cache.extract() }
  } else {
    // Use existing state in browser
    cache.restore(initialState.apolloState)
  }
})
