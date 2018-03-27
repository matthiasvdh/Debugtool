npm install -g gulp browserify
npm install
gulp
browserify js/app.js -d -p [minifyify --map bundle.js.map --output dist/bundle.js.map] > dist/bundle.js
