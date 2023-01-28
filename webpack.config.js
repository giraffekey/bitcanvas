const path = require("path")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")
// const WorkboxWebpackPlugin = require("workbox-webpack-plugin")

const isProduction = process.env.NODE_ENV == "production"

const config = {
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "build"),
  },
  devServer: {
    open: true,
    host: "localhost",
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "index.html",
    }),
    new MiniCssExtractPlugin(),
    new NodePolyfillPlugin(),
  ],
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/i,
        loader: "ts-loader",
        exclude: ["/node_modules/"],
      },
      {
        test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
        type: "asset",
      },
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          "css-loader",
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                plugins: {
                  tailwindcss: {},
                  autoprefixer: {},
                },
              },
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", "..."],
  },
}

module.exports = () => {
  if (isProduction) {
    config.mode = "production"

    // config.plugins.push(new WorkboxWebpackPlugin.GenerateSW());
  } else {
    config.mode = "development"
  }
  return config
}
