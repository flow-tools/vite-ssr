import './App.css'
import React, { useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import logo from './logo.svg'
import { ClientOnly } from '@flowtools/vite-ssr'
import { ApolloProvider } from '@apollo/client/react'

export default function App({ router, apolloClient }) {
  const [count, setCount] = useState(0)

  return (
    <ApolloProvider client={apolloClient}>
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <p>Hello ViteSSR + React + Apollo!</p>
          <p>
            <button onClick={() => setCount((count) => count + 1)}>
              count is: {count}
            </button>
          </p>

          <nav>
            <ul>
              {router.routes.map(({ name, path }) => {
                return (
                  <li key={path}>
                    <Link to={path}>{name}</Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </header>
        <Routes>
          {router.routes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={<route.component />}
            />
          ))}
        </Routes>

        <ClientOnly>
          <div>This text only renders in client side</div>
        </ClientOnly>
      </div>
    </ApolloProvider>
  )
}
