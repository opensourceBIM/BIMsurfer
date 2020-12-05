module.exports = function (grunt) {
    grunt.initConfig({
        browserify: {
            development: {
                src: [
                    "./viewer/**/*.js",
                ],
                dest: './dist/js/bimsurfer3.js',
                options: {
                    browserifyOptions: { debug: true },
                    transform: [["babelify", { "presets": ["@babel/preset-env"] }]]
                }
            }
        }
    });
    grunt.loadNpmTasks('grunt-browserify');
};
