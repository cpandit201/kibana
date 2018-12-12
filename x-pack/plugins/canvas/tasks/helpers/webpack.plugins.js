/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const {
  createServerCodeTransformer,
} = require('@kbn/interpreter/tasks/build/server_code_transformer');

const sourceDir = path.resolve(__dirname, '../../canvas_plugin_src');
const buildDir = path.resolve(__dirname, '../../canvas_plugin');

export function getWebpackConfig({ devtool, watch } = {}) {
  return {
    watch,
    devtool,

    mode: 'none',
    entry: {
      'elements/all': path.join(sourceDir, 'elements/register.js'),
      'renderers/all': path.join(sourceDir, 'renderers/register.js'),
      'uis/transforms/all': path.join(sourceDir, 'uis/transforms/register.js'),
      'uis/models/all': path.join(sourceDir, 'uis/models/register.js'),
      'uis/views/all': path.join(sourceDir, 'uis/views/register.js'),
      'uis/datasources/all': path.join(sourceDir, 'uis/datasources/register.js'),
      'uis/arguments/all': path.join(sourceDir, 'uis/arguments/register.js'),
      'functions/browser/all': path.join(sourceDir, 'functions/browser/register.js'),
      'templates/all': path.join(sourceDir, 'templates/register.js'),
      'uis/tags/all': path.join(sourceDir, 'uis/tags/register.js'),
      'strings/index': path.join(sourceDir, 'strings/index.ts'),
      'errors/index': path.join(sourceDir, 'errors/index.ts'),
    },

    // there were problems with the node and web targets since this code is actually
    // targetting both the browser and node.js. If there was a hybrid target we'd use
    // it, but this seems to work either way.
    target: 'webworker',

    output: {
      path: buildDir,
      filename: '[name].js', // Need long paths here.
      libraryTarget: 'umd',
      // Note: this is needed due to a not yet resolved bug on
      // webpack 4 with umd modules generation.
      // For now we have 2 quick workarounds: one is what is implemented
      // below another is to change the libraryTarget to commonjs
      //
      // The issues can be followed on:
      // https://github.com/webpack/webpack/issues/6642
      // https://github.com/webpack/webpack/issues/6525
      // https://github.com/webpack/webpack/issues/6677
      globalObject: `(typeof self !== 'undefined' ? self : this)`,
    },

    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      mainFields: ['browser', 'main'],
    },

    plugins: [
      function LoaderFailHandlerPlugin() {
        // bails on error, including loader errors
        // see https://github.com/webpack/webpack/issues/708, which does not fix loader errors
        this.hooks.done.tapPromise('LoaderFailHandlerPlugin', async stats => {
          if (!stats.hasErrors()) {
            return;
          }
          const errorMessage = stats.toString('errors-only');
          if (watch) {
            console.error(errorMessage);
          } else {
            throw new Error(errorMessage);
          }
        });
      },
      new CopyWebpackPlugin([
        {
          from: path.resolve(sourceDir, 'functions/server'),
          to: path.resolve(buildDir, 'functions/server'),
          transform: createServerCodeTransformer(!!devtool),
          ignore: '**/__tests__/**',
        },
        {
          from: path.resolve(sourceDir, 'functions/common'),
          to: path.resolve(buildDir, 'functions/common'),
          transform: createServerCodeTransformer(!!devtool),
          ignore: '**/__tests__/**',
        },
        {
          from: path.resolve(sourceDir, 'lib'),
          to: path.resolve(buildDir, 'lib'),
          transform: createServerCodeTransformer(!!devtool),
          ignore: '**/__tests__/**',
        },
      ]),
    ],

    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: [/node_modules/],
          loaders: 'babel-loader',
          options: {
            babelrc: false,
            presets: [require.resolve('@kbn/babel-preset/webpack_preset')],
          },
        },
        {
          test: /\.(png|jpg|gif|jpeg|svg)$/,
          loaders: ['url-loader'],
        },
        {
          test: /\.(css|scss)$/,
          loaders: ['style-loader', 'css-loader', 'sass-loader'],
        },
        {
          test: /\.tsx?$/,
          include: sourceDir,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                experimentalWatchApi: true,
                onlyCompileBundledFiles: true,
                configFile: require.resolve('../../../../tsconfig.json'),
                compilerOptions: {
                  sourceMap: Boolean(devtool),
                },
              },
            },
          ],
        },
      ],
    },

    node: {
      // Don't replace built-in globals
      __filename: false,
      __dirname: false,
    },

    watchOptions: {
      ignored: [/node_modules/],
    },

    stats: {
      // when typescript doesn't do a full type check, as we have the ts-loader
      // configured here, it does not have enough information to determine
      // whether an imported name is a type or not, so when the name is then
      // exported, typescript has no choice but to emit the export. Fortunately,
      // the extraneous export should not be harmful, so we just suppress these warnings
      // https://github.com/TypeStrong/ts-loader#transpileonly-boolean-defaultfalse
      warningsFilter: /export .* was not found in/,
    },
  };
}
