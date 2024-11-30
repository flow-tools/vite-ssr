// @ts-ignore
import App from './App'
import routes from './routes'
import ssrApp from '@flowtools/vite-ssr/react'

export default ssrApp(App, { routes }, (context) => {
  //  data fetching`
})
