var gulp  = require('gulp'),
    concat = require('gulp-concat'),
    browserify = require('gulp-browserify'),
    rename = require('gulp-rename');

var destination = "dist/";

// define the default task and add the watch task to it
gulp.task('default', ['browserify', 'copy']);


gulp.task('browserify', function() {
    return gulp.src('js/app.js', { read: false })
        .pipe(browserify())
        .pipe(rename('bundle.js'))
        .pipe(gulp.dest(destination))
});

gulp.task('copy', function() {
    gulp.src(['*.html']).pipe(gulp.dest(destination));
})

/** With 'gulp watch', automatically rebuild whenever the project changes. */
gulp.task('watch', function () {
    gulp.watch(['js/*.js', 'lib/*.js'], ['browserify']);
    gulp.watch(['*.html'], ['copy']);
});
