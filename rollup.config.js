/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import includePaths from 'rollup-plugin-includepaths';
import filesize from 'rollup-plugin-filesize';
import uglify from 'rollup-plugin-uglify';
import postcss from 'postcss';
import cssnano from 'cssnano';
import postCSSCustomVariables from 'postcss-css-variables';

// Minify css. Google search runs Chrome 41, which doesn't support CSS custom properties :(
const css = fs.readFileSync('./public/css/styles.css', 'utf8');
const output = postcss([postCSSCustomVariables()]).process(css)
  .then(result => cssnano.process(result.css))
  .then(result => fs.writeFileSync('./public/css/styles.min.css', result.css));

export default [{
  input: 'public/main.js',
  // treeshake: false,
  output: {
    file: 'public/main.bundle.js',
    name: 'app',
    format: 'iife',
  },
  experimentalDynamicImport: true,
  plugins: [
    includePaths({
      paths: ['node_modules'],
      extensions: ['.js']
    }),
    uglify(),
    filesize()
  ],
}];
