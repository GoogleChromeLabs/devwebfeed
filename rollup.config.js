import includePaths from 'rollup-plugin-includepaths';
import filesize from 'rollup-plugin-filesize';
import uglify from 'rollup-plugin-uglify';
// import scss from 'rollup-plugin-scss';

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
},/* {
  input: 'public/styles.css',
  output: {
    // file: 'public/styles.min.css',
    format: 'es',
  },
  plugins: [
    scss({
      output: 'public/styles.min.css',
      outputStyle: 'compressed'
    })
  ]
}*/];
