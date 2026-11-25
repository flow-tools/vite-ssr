import React from 'react'
import { gql } from '@apollo/client'
import { useSuspenseQuery } from '@apollo/client/react'

const GET_HELLO = gql`
  query Hello($msg: String!) {
    hello(msg: $msg) {
      otherAnswer
    }
  }
`

// Suspends until the data is there, also during SSR
function Hello() {
  const { data } = useSuspenseQuery(GET_HELLO, {
    variables: { msg: 'This is ABOUT page' },
  })

  return <h3>{data.hello.otherAnswer}</h3>
}

export default function About() {
  return (
    <>
      <h1>About</h1>
      <div>
        <Hello />
      </div>
    </>
  )
}
