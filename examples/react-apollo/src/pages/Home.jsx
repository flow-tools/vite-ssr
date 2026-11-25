import React from 'react'
import { Helmet } from 'react-helmet-async'
import { gql } from '@apollo/client'
import { useSuspenseQuery } from '@apollo/client/react'
import styled from 'styled-components'

const H1 = styled.h1`
  font-size: 1.5em;
  text-align: center;
  color: palevioletred;
`

const GET_HELLO = gql`
  query Hello($msg: String!) {
    hello(msg: $msg) {
      answer
    }
  }
`

// Suspends until the data is there, also during SSR
function Hello() {
  const { data } = useSuspenseQuery(GET_HELLO, {
    variables: { msg: 'This is HOME page' },
  })

  return <h3>{data.hello.answer}</h3>
}

export default function Home() {
  return (
    <>
      <Helmet>
        <html lang="en" />
        <meta charSet="utf-8" />
        <title>Home</title>
        <link rel="canonical" href="http://mysite.com/example" />
      </Helmet>

      <H1>Home</H1>

      <div>
        <Hello />
      </div>
    </>
  )
}
