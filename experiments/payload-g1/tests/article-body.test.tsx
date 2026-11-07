import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArticleBody } from '../lib/article-body'

const body=`## Daily life

Text with **emphasis** and [source](https://example.org/source) and [bad](javascript:alert(1)).

| Subject | Evidence |
| --- | --- |
| Homes | Pottery |

- One
- Two

![Example image](https://example.org/unknown.jpg)

<script>alert(1)</script>`
const html=renderToStaticMarkup(<ArticleBody body={body}/> )
assert.match(html,/<h2>Daily life<\/h2>/)
assert.match(html,/<strong>emphasis<\/strong>/)
assert.match(html,/<table>/)
assert.match(html,/<th scope="col">Subject<\/th>/)
assert.match(html,/<td>Pottery<\/td>/)
assert.match(html,/<ul>/)
assert.match(html,/href="https:\/\/example.org\/source"/)
assert.doesNotMatch(html,/href="javascript:/i)
assert.doesNotMatch(html,/<script>/i)
assert.doesNotMatch(html,/<img/i)
assert.match(html,/Example image/)
console.log('Article body rendering checks passed')
