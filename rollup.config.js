import fs from 'fs';
import includePaths from 'rollup-plugin-includepaths';
import filesize from 'rollup-plugin-filesize';
import uglify from 'rollup-plugin-uglify';
import postcss from 'postcss';
import cssnano from 'cssnano';
import postCSSCustomVariables from 'postcss-css-variables';

// Minify css. Google search runs Chrome 41, which doesn't support CSS custom properties :(
const css = fs.readFileSync('./public/styles.css', 'utf8');
const output = postcss([postCSSCustomVariables()]).process(css)
  .then(result => cssnano.process(result.css))
  .then(result => fs.writeFileSync('./public/styles.min.css', result.css));

export default [{
  input: 'public/app.js',
  output: {
    file: 'public/app.bundle.js',
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
