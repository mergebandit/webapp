import language from '../code/language'
import path     from 'path'

import webpack             from 'webpack'
import base_configuration  from './webpack.config'
import clean_plugin        from 'clean-webpack-plugin'
import extract_text_plugin from 'extract-text-webpack-plugin'
import strip               from 'strip-loader'

import webpack_isomorphic_tools_plugin from 'webpack-isomorphic-tools/plugin'

import application_configuration from '../code/configuration'
const websocket_url = `${application_configuration.webserver.http.host}:${application_configuration.webserver.http.port}`

const configuration = Object.clone(base_configuration)

configuration.devtool = 'source-map'

configuration.plugins = configuration.plugins.concat
(
	// clears the output folder
	new clean_plugin([path.relative(__dirname, configuration.output.path)]),

	// environment variables
	new webpack.DefinePlugin
	({
		'process.env':
		{
			// Useful to reduce the size of client-side libraries, e.g. react
			NODE_ENV: JSON.stringify('production') // 'development' to see non-minified React errors
		},

		_websocket_url_: JSON.stringify(websocket_url),

		_client_            : true,
		_server_            : false,
		_development_       : false,
		_production_        : true,
		_development_tools_ : false  // <-------- DISABLE redux-devtools HERE
	}),

	// css files from the extract-text-plugin loader
	// (for more information see the extract_text_plugin code for scss_loader below)
	//
	// the "allChunks: true" option means that this extracted file will contain 
	// the styles from all chunks of an entry (each entry can be divided into chunks).
	// without this option styles would only be extracted from the top-level chunk of an entry.
	new extract_text_plugin('[name]-[chunkhash].css', { allChunks: true }),

	// omit duplicate modules
	new webpack.optimize.DedupePlugin(),

	// Assign the module and chunk ids by occurrence count. 
	// Ids that are used often get lower (shorter) ids. 
	// This make ids predictable, reduces to total file size and is recommended.
	new webpack.optimize.OccurenceOrderPlugin(),

	// Compresses javascript files
	new webpack.optimize.UglifyJsPlugin
	({
		compress:
		{
			warnings: false
		}
	}),

	new webpack_isomorphic_tools_plugin(require('./isomorphic.js'))
)

// don't know why they write it like this
configuration.output.filename = '[name]-[chunkhash].js'

// // add strip-loader to javascript loaders
// configuration.module.loaders.filter(loader =>
// {
// 	return loader.test.toString() === configuration.regular_expressions.javascript.toString()
// })
// .first()
// .loaders.unshift(strip.loader('debug'))

// begin: set extract text plugin as a Css loader

// find the styles loader
const scss_loader = configuration.module.loaders.filter(loader =>
{
	return loader.test.toString() === configuration.regular_expressions.styles.toString()
})
.first()

// https://github.com/webpack/extract-text-webpack-plugin
//
// It moves every require("style.css") in entry chunks into a separate css output file. 
// So your styles are no longer inlined into the javascript, but separate 
// in a css bundle file (styles.css). If your total stylesheet volume is big, 
// it will be faster because the stylesheet bundle is loaded in parallel to the javascript bundle.
// (but it also disables hot module reload)
//
// the first argument to the .extract() function is the name of the loader 
// ("style-loader" in this case) to be applied to non-top-level-chunks in case of "allChunks: false" option.
// since in this configuration "allChunks: true" option is used, this first argument is irrelevant.
scss_loader.loader = extract_text_plugin.extract(scss_loader.loaders.shift(), scss_loader.loaders.join('!'))
delete scss_loader.loaders

// done: set extract text plugin as a Css loader

export default configuration