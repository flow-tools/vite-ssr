// Slightly adjusted from https://github.com/vuejs/vue-next/blob/master/scripts/verifyCommit.js
// Invoked on the commit-msg git hook by yorkie.
import chalk from 'chalk';
import { readFileSync } from 'node:fs'

const msgPath = process.env.GIT_PARAMS
const msg = readFileSync(msgPath, 'utf-8').trim()

const commitRE =
  /^(revert: )?(feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(\(.+\))?: .{1,50}/

if (!commitRE.test(msg)) {
  console.log()
  console.error(
    `${chalk.bgRed.white(' ERROR ')} ${chalk.red(
      `invalid commit message format.`
    )}\n`
  )
  process.exit(1)
}
