module.exports = function(grunt) {
	grunt
			.initConfig({
				pkg : grunt.file.readJSON("package.json"),
				clean: ["output"],
				concat : {
					js : {
						files : {
							"output/js/bimsurfer3.js" : [ 
						    ]
						},
					}
				},
				uglify : {
					dist : {
						files : {
							"output/js/bimviews.min.js" : [ "output/js/bimviews.js" ]
						}
					}
				},
				cssmin : {
					options : {
						shorthandCompacting : false,
						roundingPrecision : -1
					},
					target : {
						files : {
							"output/css/bimviews.min.css" : [ "css/bootstrap.css", "css/main.css", "css/bootstrap-vert-tabs.css", "css/magic-bootstrap-min.css" ]
						}
					}
				},
				copy : {
					main : {
						files : [{
							expand : true,
							src : [ "fonts/**", "img/**" ],
							dest : "output/"
						}, {
							src: ["*.html"],
							dest: "output/"
						}, {
							src: ["deps/**"],
							dest: "output/"
						}, {
							src: ["plugin/**"],
							dest: "output/"
						}]
					}
				},
				zip: {
					"using-cwd": {
						cwd: "output",
						src: ["output/**"],
						dest: "output/bimviews-%VERSION%.zip"
					}
				}
			});

	grunt.loadNpmTasks("grunt-contrib-concat");
	grunt.loadNpmTasks("grunt-contrib-uglify");
	grunt.loadNpmTasks("grunt-contrib-cssmin");
	grunt.loadNpmTasks("grunt-contrib-copy");
	grunt.loadNpmTasks("grunt-contrib-clean");
	grunt.loadNpmTasks("grunt-zip");

	grunt.registerTask("default", [ "clean", "concat", "cssmin", "copy" ]);
};