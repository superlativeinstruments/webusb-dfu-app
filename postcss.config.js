module.exports = {
	plugins: [
		require('postcss-nested'),
		require('autoprefixer')({flexbox: true, grid: true}),
		require('postcss-flexbugs-fixes')
	]
};
