'use strict';var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {return typeof obj;} : function (obj) {return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;};





var _ExportMap = require('../ExportMap');var _ExportMap2 = _interopRequireDefault(_ExportMap);
var _ignore = require('eslint-module-utils/ignore');
var _resolve = require('eslint-module-utils/resolve');var _resolve2 = _interopRequireDefault(_resolve);
var _visit = require('eslint-module-utils/visit');var _visit2 = _interopRequireDefault(_visit);
var _docsUrl = require('../docsUrl');var _docsUrl2 = _interopRequireDefault(_docsUrl);
var _path = require('path');
var _readPkgUp2 = require('eslint-module-utils/readPkgUp');var _readPkgUp3 = _interopRequireDefault(_readPkgUp2);
var _object = require('object.values');var _object2 = _interopRequireDefault(_object);
var _arrayIncludes = require('array-includes');var _arrayIncludes2 = _interopRequireDefault(_arrayIncludes);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { 'default': obj };}function _toConsumableArray(arr) {if (Array.isArray(arr)) {for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) {arr2[i] = arr[i];}return arr2;} else {return Array.from(arr);}} /**
                                                                                                                                                                                                                                                                                                                                                                                                       * @fileOverview Ensures that modules contain exports and/or all
                                                                                                                                                                                                                                                                                                                                                                                                       * modules are consumed within other modules.
                                                                                                                                                                                                                                                                                                                                                                                                       * @author René Fermann
                                                                                                                                                                                                                                                                                                                                                                                                       */var FileEnumerator = void 0;var listFilesToProcess = void 0;
try {var _require =
  require('eslint/use-at-your-own-risk');FileEnumerator = _require.FileEnumerator;
} catch (e) {
  try {var _require2 =

    require('eslint/lib/cli-engine/file-enumerator'); // has been moved to eslint/lib/cli-engine/file-enumerator in version 6
    FileEnumerator = _require2.FileEnumerator;} catch (e) {
    try {
      // eslint/lib/util/glob-util has been moved to eslint/lib/util/glob-utils with version 5.3
      var _require3 = require('eslint/lib/util/glob-utils'),originalListFilesToProcess = _require3.listFilesToProcess;

      // Prevent passing invalid options (extensions array) to old versions of the function.
      // https://github.com/eslint/eslint/blob/v5.16.0/lib/util/glob-utils.js#L178-L280
      // https://github.com/eslint/eslint/blob/v5.2.0/lib/util/glob-util.js#L174-L269
      listFilesToProcess = function listFilesToProcess(src, extensions) {
        return originalListFilesToProcess(src, {
          extensions: extensions });

      };
    } catch (e) {var _require4 =
      require('eslint/lib/util/glob-util'),_originalListFilesToProcess = _require4.listFilesToProcess;

      listFilesToProcess = function listFilesToProcess(src, extensions) {
        var patterns = src.reduce(
        function (carry, pattern) {return carry.concat(
          extensions.map(function (extension) {return (/\*\*|\*\./.test(pattern) ? pattern : String(pattern) + '/**/*' + String(extension));}));},

        src);


        return _originalListFilesToProcess(patterns);
      };
    }
  }
}

if (FileEnumerator) {
  listFilesToProcess = function listFilesToProcess(src, extensions) {
    var e = new FileEnumerator({
      extensions: extensions });


    return Array.from(e.iterateFiles(src), function (_ref) {var filePath = _ref.filePath,ignored = _ref.ignored;return {
        ignored: ignored,
        filename: filePath };});

  };
}

var EXPORT_DEFAULT_DECLARATION = 'ExportDefaultDeclaration';
var EXPORT_NAMED_DECLARATION = 'ExportNamedDeclaration';
var EXPORT_ALL_DECLARATION = 'ExportAllDeclaration';
var IMPORT_DECLARATION = 'ImportDeclaration';
var IMPORT_NAMESPACE_SPECIFIER = 'ImportNamespaceSpecifier';
var IMPORT_DEFAULT_SPECIFIER = 'ImportDefaultSpecifier';
var VARIABLE_DECLARATION = 'VariableDeclaration';
var FUNCTION_DECLARATION = 'FunctionDeclaration';
var CLASS_DECLARATION = 'ClassDeclaration';
var IDENTIFIER = 'Identifier';
var OBJECT_PATTERN = 'ObjectPattern';
var TS_INTERFACE_DECLARATION = 'TSInterfaceDeclaration';
var TS_TYPE_ALIAS_DECLARATION = 'TSTypeAliasDeclaration';
var TS_ENUM_DECLARATION = 'TSEnumDeclaration';
var DEFAULT = 'default';

function forEachDeclarationIdentifier(declaration, cb) {
  if (declaration) {
    if (
    declaration.type === FUNCTION_DECLARATION ||
    declaration.type === CLASS_DECLARATION ||
    declaration.type === TS_INTERFACE_DECLARATION ||
    declaration.type === TS_TYPE_ALIAS_DECLARATION ||
    declaration.type === TS_ENUM_DECLARATION)
    {
      cb(declaration.id.name);
    } else if (declaration.type === VARIABLE_DECLARATION) {
      declaration.declarations.forEach(function (_ref2) {var id = _ref2.id;
        if (id.type === OBJECT_PATTERN) {
          (0, _ExportMap.recursivePatternCapture)(id, function (pattern) {
            if (pattern.type === IDENTIFIER) {
              cb(pattern.name);
            }
          });
        } else {
          cb(id.name);
        }
      });
    }
  }
}

/**
   * List of imports per file.
   *
   * Represented by a two-level Map to a Set of identifiers. The upper-level Map
   * keys are the paths to the modules containing the imports, while the
   * lower-level Map keys are the paths to the files which are being imported
   * from. Lastly, the Set of identifiers contains either names being imported
   * or a special AST node name listed above (e.g ImportDefaultSpecifier).
   *
   * For example, if we have a file named foo.js containing:
   *
   *   import { o2 } from './bar.js';
   *
   * Then we will have a structure that looks like:
   *
   *   Map { 'foo.js' => Map { 'bar.js' => Set { 'o2' } } }
   *
   * @type {Map<string, Map<string, Set<string>>>}
   */
var importList = new Map();

/**
                             * List of exports per file.
                             *
                             * Represented by a two-level Map to an object of metadata. The upper-level Map
                             * keys are the paths to the modules containing the exports, while the
                             * lower-level Map keys are the specific identifiers or special AST node names
                             * being exported. The leaf-level metadata object at the moment only contains a
                             * `whereUsed` property, which contains a Set of paths to modules that import
                             * the name.
                             *
                             * For example, if we have a file named bar.js containing the following exports:
                             *
                             *   const o2 = 'bar';
                             *   export { o2 };
                             *
                             * And a file named foo.js containing the following import:
                             *
                             *   import { o2 } from './bar.js';
                             *
                             * Then we will have a structure that looks like:
                             *
                             *   Map { 'bar.js' => Map { 'o2' => { whereUsed: Set { 'foo.js' } } } }
                             *
                             * @type {Map<string, Map<string, object>>}
                             */
var exportList = new Map();

var visitorKeyMap = new Map();

var ignoredFiles = new Set();
var filesOutsideSrc = new Set();

var isNodeModule = function isNodeModule(path) {return (/\/(node_modules)\//.test(path));};

/**
                                                                                             * read all files matching the patterns in src and ignoreExports
                                                                                             *
                                                                                             * return all files matching src pattern, which are not matching the ignoreExports pattern
                                                                                             */
var resolveFiles = function resolveFiles(src, ignoreExports, context) {
  var extensions = Array.from((0, _ignore.getFileExtensions)(context.settings));

  var srcFiles = new Set();
  var srcFileList = listFilesToProcess(src, extensions);

  // prepare list of ignored files
  var ignoredFilesList = listFilesToProcess(ignoreExports, extensions);
  ignoredFilesList.forEach(function (_ref3) {var filename = _ref3.filename;return ignoredFiles.add(filename);});

  // prepare list of source files, don't consider files from node_modules
  srcFileList.filter(function (_ref4) {var filename = _ref4.filename;return !isNodeModule(filename);}).forEach(function (_ref5) {var filename = _ref5.filename;
    srcFiles.add(filename);
  });
  return srcFiles;
};

/**
    * parse all source files and build up 2 maps containing the existing imports and exports
    */
var prepareImportsAndExports = function prepareImportsAndExports(srcFiles, context) {
  var exportAll = new Map();
  srcFiles.forEach(function (file) {
    var exports = new Map();
    var imports = new Map();
    var currentExports = _ExportMap2['default'].get(file, context);
    if (currentExports) {var

      dependencies =




      currentExports.dependencies,reexports = currentExports.reexports,localImportList = currentExports.imports,namespace = currentExports.namespace,visitorKeys = currentExports.visitorKeys;

      visitorKeyMap.set(file, visitorKeys);
      // dependencies === export * from
      var currentExportAll = new Set();
      dependencies.forEach(function (getDependency) {
        var dependency = getDependency();
        if (dependency === null) {
          return;
        }

        currentExportAll.add(dependency.path);
      });
      exportAll.set(file, currentExportAll);

      reexports.forEach(function (value, key) {
        if (key === DEFAULT) {
          exports.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed: new Set() });
        } else {
          exports.set(key, { whereUsed: new Set() });
        }
        var reexport = value.getImport();
        if (!reexport) {
          return;
        }
        var localImport = imports.get(reexport.path);
        var currentValue = void 0;
        if (value.local === DEFAULT) {
          currentValue = IMPORT_DEFAULT_SPECIFIER;
        } else {
          currentValue = value.local;
        }
        if (typeof localImport !== 'undefined') {
          localImport = new Set([].concat(_toConsumableArray(localImport), [currentValue]));
        } else {
          localImport = new Set([currentValue]);
        }
        imports.set(reexport.path, localImport);
      });

      localImportList.forEach(function (value, key) {
        if (isNodeModule(key)) {
          return;
        }
        var localImport = imports.get(key) || new Set();
        value.declarations.forEach(function (_ref6) {var importedSpecifiers = _ref6.importedSpecifiers;
          importedSpecifiers.forEach(function (specifier) {
            localImport.add(specifier);
          });
        });
        imports.set(key, localImport);
      });
      importList.set(file, imports);

      // build up export list only, if file is not ignored
      if (ignoredFiles.has(file)) {
        return;
      }
      namespace.forEach(function (value, key) {
        if (key === DEFAULT) {
          exports.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed: new Set() });
        } else {
          exports.set(key, { whereUsed: new Set() });
        }
      });
    }
    exports.set(EXPORT_ALL_DECLARATION, { whereUsed: new Set() });
    exports.set(IMPORT_NAMESPACE_SPECIFIER, { whereUsed: new Set() });
    exportList.set(file, exports);
  });
  exportAll.forEach(function (value, key) {
    value.forEach(function (val) {
      var currentExports = exportList.get(val);
      if (currentExports) {
        var currentExport = currentExports.get(EXPORT_ALL_DECLARATION);
        currentExport.whereUsed.add(key);
      }
    });
  });
};

/**
    * traverse through all imports and add the respective path to the whereUsed-list
    * of the corresponding export
    */
var determineUsage = function determineUsage() {
  importList.forEach(function (listValue, listKey) {
    listValue.forEach(function (value, key) {
      var exports = exportList.get(key);
      if (typeof exports !== 'undefined') {
        value.forEach(function (currentImport) {
          var specifier = void 0;
          if (currentImport === IMPORT_NAMESPACE_SPECIFIER) {
            specifier = IMPORT_NAMESPACE_SPECIFIER;
          } else if (currentImport === IMPORT_DEFAULT_SPECIFIER) {
            specifier = IMPORT_DEFAULT_SPECIFIER;
          } else {
            specifier = currentImport;
          }
          if (typeof specifier !== 'undefined') {
            var exportStatement = exports.get(specifier);
            if (typeof exportStatement !== 'undefined') {var
              whereUsed = exportStatement.whereUsed;
              whereUsed.add(listKey);
              exports.set(specifier, { whereUsed: whereUsed });
            }
          }
        });
      }
    });
  });
};

var getSrc = function getSrc(src) {
  if (src) {
    return src;
  }
  return [process.cwd()];
};

/**
    * prepare the lists of existing imports and exports - should only be executed once at
    * the start of a new eslint run
    */
var srcFiles = void 0;
var lastPrepareKey = void 0;
var doPreparation = function doPreparation(src, ignoreExports, context) {
  var prepareKey = JSON.stringify({
    src: (src || []).sort(),
    ignoreExports: (ignoreExports || []).sort(),
    extensions: Array.from((0, _ignore.getFileExtensions)(context.settings)).sort() });

  if (prepareKey === lastPrepareKey) {
    return;
  }

  importList.clear();
  exportList.clear();
  ignoredFiles.clear();
  filesOutsideSrc.clear();

  srcFiles = resolveFiles(getSrc(src), ignoreExports, context);
  prepareImportsAndExports(srcFiles, context);
  determineUsage();
  lastPrepareKey = prepareKey;
};

var newNamespaceImportExists = function newNamespaceImportExists(specifiers) {return specifiers.some(function (_ref7) {var type = _ref7.type;return type === IMPORT_NAMESPACE_SPECIFIER;});};

var newDefaultImportExists = function newDefaultImportExists(specifiers) {return specifiers.some(function (_ref8) {var type = _ref8.type;return type === IMPORT_DEFAULT_SPECIFIER;});};

var fileIsInPkg = function fileIsInPkg(file) {var _readPkgUp =
  (0, _readPkgUp3['default'])({ cwd: file }),path = _readPkgUp.path,pkg = _readPkgUp.pkg;
  var basePath = (0, _path.dirname)(path);

  var checkPkgFieldString = function checkPkgFieldString(pkgField) {
    if ((0, _path.join)(basePath, pkgField) === file) {
      return true;
    }
  };

  var checkPkgFieldObject = function checkPkgFieldObject(pkgField) {
    var pkgFieldFiles = (0, _object2['default'])(pkgField).
    filter(function (value) {return typeof value !== 'boolean';}).
    map(function (value) {return (0, _path.join)(basePath, value);});

    if ((0, _arrayIncludes2['default'])(pkgFieldFiles, file)) {
      return true;
    }
  };

  var checkPkgField = function checkPkgField(pkgField) {
    if (typeof pkgField === 'string') {
      return checkPkgFieldString(pkgField);
    }

    if ((typeof pkgField === 'undefined' ? 'undefined' : _typeof(pkgField)) === 'object') {
      return checkPkgFieldObject(pkgField);
    }
  };

  if (pkg['private'] === true) {
    return false;
  }

  if (pkg.bin) {
    if (checkPkgField(pkg.bin)) {
      return true;
    }
  }

  if (pkg.browser) {
    if (checkPkgField(pkg.browser)) {
      return true;
    }
  }

  if (pkg.main) {
    if (checkPkgFieldString(pkg.main)) {
      return true;
    }
  }

  return false;
};

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      category: 'Helpful warnings',
      description: 'Forbid modules without exports, or exports without matching import in another module.',
      url: (0, _docsUrl2['default'])('no-unused-modules') },

    schema: [{
      properties: {
        src: {
          description: 'files/paths to be analyzed (only for unused exports)',
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            minLength: 1 } },


        ignoreExports: {
          description:
          'files/paths for which unused exports will not be reported (e.g module entry points)',
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            minLength: 1 } },


        missingExports: {
          description: 'report modules without any exports',
          type: 'boolean' },

        unusedExports: {
          description: 'report exports without any usage',
          type: 'boolean' } },


      not: {
        properties: {
          unusedExports: { 'enum': [false] },
          missingExports: { 'enum': [false] } } },


      anyOf: [{
        not: {
          properties: {
            unusedExports: { 'enum': [true] } } },


        required: ['missingExports'] },
      {
        not: {
          properties: {
            missingExports: { 'enum': [true] } } },


        required: ['unusedExports'] },
      {
        properties: {
          unusedExports: { 'enum': [true] } },

        required: ['unusedExports'] },
      {
        properties: {
          missingExports: { 'enum': [true] } },

        required: ['missingExports'] }] }] },




  create: function () {function create(context) {var _ref9 =





      context.options[0] || {},src = _ref9.src,_ref9$ignoreExports = _ref9.ignoreExports,ignoreExports = _ref9$ignoreExports === undefined ? [] : _ref9$ignoreExports,missingExports = _ref9.missingExports,unusedExports = _ref9.unusedExports;

      if (unusedExports) {
        doPreparation(src, ignoreExports, context);
      }

      var file = context.getPhysicalFilename ? context.getPhysicalFilename() : context.getFilename();

      var checkExportPresence = function () {function checkExportPresence(node) {
          if (!missingExports) {
            return;
          }

          if (ignoredFiles.has(file)) {
            return;
          }

          var exportCount = exportList.get(file);
          var exportAll = exportCount.get(EXPORT_ALL_DECLARATION);
          var namespaceImports = exportCount.get(IMPORT_NAMESPACE_SPECIFIER);

          exportCount['delete'](EXPORT_ALL_DECLARATION);
          exportCount['delete'](IMPORT_NAMESPACE_SPECIFIER);
          if (exportCount.size < 1) {
            // node.body[0] === 'undefined' only happens, if everything is commented out in the file
            // being linted
            context.report(node.body[0] ? node.body[0] : node, 'No exports found');
          }
          exportCount.set(EXPORT_ALL_DECLARATION, exportAll);
          exportCount.set(IMPORT_NAMESPACE_SPECIFIER, namespaceImports);
        }return checkExportPresence;}();

      var checkUsage = function () {function checkUsage(node, exportedValue) {
          if (!unusedExports) {
            return;
          }

          if (ignoredFiles.has(file)) {
            return;
          }

          if (fileIsInPkg(file)) {
            return;
          }

          if (filesOutsideSrc.has(file)) {
            return;
          }

          // make sure file to be linted is included in source files
          if (!srcFiles.has(file)) {
            srcFiles = resolveFiles(getSrc(src), ignoreExports, context);
            if (!srcFiles.has(file)) {
              filesOutsideSrc.add(file);
              return;
            }
          }

          exports = exportList.get(file);

          // special case: export * from
          var exportAll = exports.get(EXPORT_ALL_DECLARATION);
          if (typeof exportAll !== 'undefined' && exportedValue !== IMPORT_DEFAULT_SPECIFIER) {
            if (exportAll.whereUsed.size > 0) {
              return;
            }
          }

          // special case: namespace import
          var namespaceImports = exports.get(IMPORT_NAMESPACE_SPECIFIER);
          if (typeof namespaceImports !== 'undefined') {
            if (namespaceImports.whereUsed.size > 0) {
              return;
            }
          }

          // exportsList will always map any imported value of 'default' to 'ImportDefaultSpecifier'
          var exportsKey = exportedValue === DEFAULT ? IMPORT_DEFAULT_SPECIFIER : exportedValue;

          var exportStatement = exports.get(exportsKey);

          var value = exportsKey === IMPORT_DEFAULT_SPECIFIER ? DEFAULT : exportsKey;

          if (typeof exportStatement !== 'undefined') {
            if (exportStatement.whereUsed.size < 1) {
              context.report(
              node, 'exported declaration \'' +
              value + '\' not used within other modules');

            }
          } else {
            context.report(
            node, 'exported declaration \'' +
            value + '\' not used within other modules');

          }
        }return checkUsage;}();

      /**
                                 * only useful for tools like vscode-eslint
                                 *
                                 * update lists of existing exports during runtime
                                 */
      var updateExportUsage = function () {function updateExportUsage(node) {
          if (ignoredFiles.has(file)) {
            return;
          }

          var exports = exportList.get(file);

          // new module has been created during runtime
          // include it in further processing
          if (typeof exports === 'undefined') {
            exports = new Map();
          }

          var newExports = new Map();
          var newExportIdentifiers = new Set();

          node.body.forEach(function (_ref10) {var type = _ref10.type,declaration = _ref10.declaration,specifiers = _ref10.specifiers;
            if (type === EXPORT_DEFAULT_DECLARATION) {
              newExportIdentifiers.add(IMPORT_DEFAULT_SPECIFIER);
            }
            if (type === EXPORT_NAMED_DECLARATION) {
              if (specifiers.length > 0) {
                specifiers.forEach(function (specifier) {
                  if (specifier.exported) {
                    newExportIdentifiers.add(specifier.exported.name || specifier.exported.value);
                  }
                });
              }
              forEachDeclarationIdentifier(declaration, function (name) {
                newExportIdentifiers.add(name);
              });
            }
          });

          // old exports exist within list of new exports identifiers: add to map of new exports
          exports.forEach(function (value, key) {
            if (newExportIdentifiers.has(key)) {
              newExports.set(key, value);
            }
          });

          // new export identifiers added: add to map of new exports
          newExportIdentifiers.forEach(function (key) {
            if (!exports.has(key)) {
              newExports.set(key, { whereUsed: new Set() });
            }
          });

          // preserve information about namespace imports
          var exportAll = exports.get(EXPORT_ALL_DECLARATION);
          var namespaceImports = exports.get(IMPORT_NAMESPACE_SPECIFIER);

          if (typeof namespaceImports === 'undefined') {
            namespaceImports = { whereUsed: new Set() };
          }

          newExports.set(EXPORT_ALL_DECLARATION, exportAll);
          newExports.set(IMPORT_NAMESPACE_SPECIFIER, namespaceImports);
          exportList.set(file, newExports);
        }return updateExportUsage;}();

      /**
                                        * only useful for tools like vscode-eslint
                                        *
                                        * update lists of existing imports during runtime
                                        */
      var updateImportUsage = function () {function updateImportUsage(node) {
          if (!unusedExports) {
            return;
          }

          var oldImportPaths = importList.get(file);
          if (typeof oldImportPaths === 'undefined') {
            oldImportPaths = new Map();
          }

          var oldNamespaceImports = new Set();
          var newNamespaceImports = new Set();

          var oldExportAll = new Set();
          var newExportAll = new Set();

          var oldDefaultImports = new Set();
          var newDefaultImports = new Set();

          var oldImports = new Map();
          var newImports = new Map();
          oldImportPaths.forEach(function (value, key) {
            if (value.has(EXPORT_ALL_DECLARATION)) {
              oldExportAll.add(key);
            }
            if (value.has(IMPORT_NAMESPACE_SPECIFIER)) {
              oldNamespaceImports.add(key);
            }
            if (value.has(IMPORT_DEFAULT_SPECIFIER)) {
              oldDefaultImports.add(key);
            }
            value.forEach(function (val) {
              if (
              val !== IMPORT_NAMESPACE_SPECIFIER &&
              val !== IMPORT_DEFAULT_SPECIFIER)
              {
                oldImports.set(val, key);
              }
            });
          });

          function processDynamicImport(source) {
            if (source.type !== 'Literal') {
              return null;
            }
            var p = (0, _resolve2['default'])(source.value, context);
            if (p == null) {
              return null;
            }
            newNamespaceImports.add(p);
          }

          (0, _visit2['default'])(node, visitorKeyMap.get(file), {
            ImportExpression: function () {function ImportExpression(child) {
                processDynamicImport(child.source);
              }return ImportExpression;}(),
            CallExpression: function () {function CallExpression(child) {
                if (child.callee.type === 'Import') {
                  processDynamicImport(child.arguments[0]);
                }
              }return CallExpression;}() });


          node.body.forEach(function (astNode) {
            var resolvedPath = void 0;

            // support for export { value } from 'module'
            if (astNode.type === EXPORT_NAMED_DECLARATION) {
              if (astNode.source) {
                resolvedPath = (0, _resolve2['default'])(astNode.source.raw.replace(/('|")/g, ''), context);
                astNode.specifiers.forEach(function (specifier) {
                  var name = specifier.local.name || specifier.local.value;
                  if (name === DEFAULT) {
                    newDefaultImports.add(resolvedPath);
                  } else {
                    newImports.set(name, resolvedPath);
                  }
                });
              }
            }

            if (astNode.type === EXPORT_ALL_DECLARATION) {
              resolvedPath = (0, _resolve2['default'])(astNode.source.raw.replace(/('|")/g, ''), context);
              newExportAll.add(resolvedPath);
            }

            if (astNode.type === IMPORT_DECLARATION) {
              resolvedPath = (0, _resolve2['default'])(astNode.source.raw.replace(/('|")/g, ''), context);
              if (!resolvedPath) {
                return;
              }

              if (isNodeModule(resolvedPath)) {
                return;
              }

              if (newNamespaceImportExists(astNode.specifiers)) {
                newNamespaceImports.add(resolvedPath);
              }

              if (newDefaultImportExists(astNode.specifiers)) {
                newDefaultImports.add(resolvedPath);
              }

              astNode.specifiers.
              filter(function (specifier) {return specifier.type !== IMPORT_DEFAULT_SPECIFIER && specifier.type !== IMPORT_NAMESPACE_SPECIFIER;}).
              forEach(function (specifier) {
                newImports.set(specifier.imported.name || specifier.imported.value, resolvedPath);
              });
            }
          });

          newExportAll.forEach(function (value) {
            if (!oldExportAll.has(value)) {
              var imports = oldImportPaths.get(value);
              if (typeof imports === 'undefined') {
                imports = new Set();
              }
              imports.add(EXPORT_ALL_DECLARATION);
              oldImportPaths.set(value, imports);

              var _exports = exportList.get(value);
              var currentExport = void 0;
              if (typeof _exports !== 'undefined') {
                currentExport = _exports.get(EXPORT_ALL_DECLARATION);
              } else {
                _exports = new Map();
                exportList.set(value, _exports);
              }

              if (typeof currentExport !== 'undefined') {
                currentExport.whereUsed.add(file);
              } else {
                var whereUsed = new Set();
                whereUsed.add(file);
                _exports.set(EXPORT_ALL_DECLARATION, { whereUsed: whereUsed });
              }
            }
          });

          oldExportAll.forEach(function (value) {
            if (!newExportAll.has(value)) {
              var imports = oldImportPaths.get(value);
              imports['delete'](EXPORT_ALL_DECLARATION);

              var _exports2 = exportList.get(value);
              if (typeof _exports2 !== 'undefined') {
                var currentExport = _exports2.get(EXPORT_ALL_DECLARATION);
                if (typeof currentExport !== 'undefined') {
                  currentExport.whereUsed['delete'](file);
                }
              }
            }
          });

          newDefaultImports.forEach(function (value) {
            if (!oldDefaultImports.has(value)) {
              var imports = oldImportPaths.get(value);
              if (typeof imports === 'undefined') {
                imports = new Set();
              }
              imports.add(IMPORT_DEFAULT_SPECIFIER);
              oldImportPaths.set(value, imports);

              var _exports3 = exportList.get(value);
              var currentExport = void 0;
              if (typeof _exports3 !== 'undefined') {
                currentExport = _exports3.get(IMPORT_DEFAULT_SPECIFIER);
              } else {
                _exports3 = new Map();
                exportList.set(value, _exports3);
              }

              if (typeof currentExport !== 'undefined') {
                currentExport.whereUsed.add(file);
              } else {
                var whereUsed = new Set();
                whereUsed.add(file);
                _exports3.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed: whereUsed });
              }
            }
          });

          oldDefaultImports.forEach(function (value) {
            if (!newDefaultImports.has(value)) {
              var imports = oldImportPaths.get(value);
              imports['delete'](IMPORT_DEFAULT_SPECIFIER);

              var _exports4 = exportList.get(value);
              if (typeof _exports4 !== 'undefined') {
                var currentExport = _exports4.get(IMPORT_DEFAULT_SPECIFIER);
                if (typeof currentExport !== 'undefined') {
                  currentExport.whereUsed['delete'](file);
                }
              }
            }
          });

          newNamespaceImports.forEach(function (value) {
            if (!oldNamespaceImports.has(value)) {
              var imports = oldImportPaths.get(value);
              if (typeof imports === 'undefined') {
                imports = new Set();
              }
              imports.add(IMPORT_NAMESPACE_SPECIFIER);
              oldImportPaths.set(value, imports);

              var _exports5 = exportList.get(value);
              var currentExport = void 0;
              if (typeof _exports5 !== 'undefined') {
                currentExport = _exports5.get(IMPORT_NAMESPACE_SPECIFIER);
              } else {
                _exports5 = new Map();
                exportList.set(value, _exports5);
              }

              if (typeof currentExport !== 'undefined') {
                currentExport.whereUsed.add(file);
              } else {
                var whereUsed = new Set();
                whereUsed.add(file);
                _exports5.set(IMPORT_NAMESPACE_SPECIFIER, { whereUsed: whereUsed });
              }
            }
          });

          oldNamespaceImports.forEach(function (value) {
            if (!newNamespaceImports.has(value)) {
              var imports = oldImportPaths.get(value);
              imports['delete'](IMPORT_NAMESPACE_SPECIFIER);

              var _exports6 = exportList.get(value);
              if (typeof _exports6 !== 'undefined') {
                var currentExport = _exports6.get(IMPORT_NAMESPACE_SPECIFIER);
                if (typeof currentExport !== 'undefined') {
                  currentExport.whereUsed['delete'](file);
                }
              }
            }
          });

          newImports.forEach(function (value, key) {
            if (!oldImports.has(key)) {
              var imports = oldImportPaths.get(value);
              if (typeof imports === 'undefined') {
                imports = new Set();
              }
              imports.add(key);
              oldImportPaths.set(value, imports);

              var _exports7 = exportList.get(value);
              var currentExport = void 0;
              if (typeof _exports7 !== 'undefined') {
                currentExport = _exports7.get(key);
              } else {
                _exports7 = new Map();
                exportList.set(value, _exports7);
              }

              if (typeof currentExport !== 'undefined') {
                currentExport.whereUsed.add(file);
              } else {
                var whereUsed = new Set();
                whereUsed.add(file);
                _exports7.set(key, { whereUsed: whereUsed });
              }
            }
          });

          oldImports.forEach(function (value, key) {
            if (!newImports.has(key)) {
              var imports = oldImportPaths.get(value);
              imports['delete'](key);

              var _exports8 = exportList.get(value);
              if (typeof _exports8 !== 'undefined') {
                var currentExport = _exports8.get(key);
                if (typeof currentExport !== 'undefined') {
                  currentExport.whereUsed['delete'](file);
                }
              }
            }
          });
        }return updateImportUsage;}();

      return {
        'Program:exit': function () {function ProgramExit(node) {
            updateExportUsage(node);
            updateImportUsage(node);
            checkExportPresence(node);
          }return ProgramExit;}(),
        ExportDefaultDeclaration: function () {function ExportDefaultDeclaration(node) {
            checkUsage(node, IMPORT_DEFAULT_SPECIFIER);
          }return ExportDefaultDeclaration;}(),
        ExportNamedDeclaration: function () {function ExportNamedDeclaration(node) {
            node.specifiers.forEach(function (specifier) {
              checkUsage(node, specifier.exported.name || specifier.exported.value);
            });
            forEachDeclarationIdentifier(node.declaration, function (name) {
              checkUsage(node, name);
            });
          }return ExportNamedDeclaration;}() };

    }return create;}() };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9uby11bnVzZWQtbW9kdWxlcy5qcyJdLCJuYW1lcyI6WyJGaWxlRW51bWVyYXRvciIsImxpc3RGaWxlc1RvUHJvY2VzcyIsInJlcXVpcmUiLCJlIiwib3JpZ2luYWxMaXN0RmlsZXNUb1Byb2Nlc3MiLCJzcmMiLCJleHRlbnNpb25zIiwicGF0dGVybnMiLCJyZWR1Y2UiLCJjYXJyeSIsInBhdHRlcm4iLCJjb25jYXQiLCJtYXAiLCJleHRlbnNpb24iLCJ0ZXN0IiwiQXJyYXkiLCJmcm9tIiwiaXRlcmF0ZUZpbGVzIiwiZmlsZVBhdGgiLCJpZ25vcmVkIiwiZmlsZW5hbWUiLCJFWFBPUlRfREVGQVVMVF9ERUNMQVJBVElPTiIsIkVYUE9SVF9OQU1FRF9ERUNMQVJBVElPTiIsIkVYUE9SVF9BTExfREVDTEFSQVRJT04iLCJJTVBPUlRfREVDTEFSQVRJT04iLCJJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUiIsIklNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiIsIlZBUklBQkxFX0RFQ0xBUkFUSU9OIiwiRlVOQ1RJT05fREVDTEFSQVRJT04iLCJDTEFTU19ERUNMQVJBVElPTiIsIklERU5USUZJRVIiLCJPQkpFQ1RfUEFUVEVSTiIsIlRTX0lOVEVSRkFDRV9ERUNMQVJBVElPTiIsIlRTX1RZUEVfQUxJQVNfREVDTEFSQVRJT04iLCJUU19FTlVNX0RFQ0xBUkFUSU9OIiwiREVGQVVMVCIsImZvckVhY2hEZWNsYXJhdGlvbklkZW50aWZpZXIiLCJkZWNsYXJhdGlvbiIsImNiIiwidHlwZSIsImlkIiwibmFtZSIsImRlY2xhcmF0aW9ucyIsImZvckVhY2giLCJpbXBvcnRMaXN0IiwiTWFwIiwiZXhwb3J0TGlzdCIsInZpc2l0b3JLZXlNYXAiLCJpZ25vcmVkRmlsZXMiLCJTZXQiLCJmaWxlc091dHNpZGVTcmMiLCJpc05vZGVNb2R1bGUiLCJwYXRoIiwicmVzb2x2ZUZpbGVzIiwiaWdub3JlRXhwb3J0cyIsImNvbnRleHQiLCJzZXR0aW5ncyIsInNyY0ZpbGVzIiwic3JjRmlsZUxpc3QiLCJpZ25vcmVkRmlsZXNMaXN0IiwiYWRkIiwiZmlsdGVyIiwicHJlcGFyZUltcG9ydHNBbmRFeHBvcnRzIiwiZXhwb3J0QWxsIiwiZmlsZSIsImV4cG9ydHMiLCJpbXBvcnRzIiwiY3VycmVudEV4cG9ydHMiLCJFeHBvcnRzIiwiZ2V0IiwiZGVwZW5kZW5jaWVzIiwicmVleHBvcnRzIiwibG9jYWxJbXBvcnRMaXN0IiwibmFtZXNwYWNlIiwidmlzaXRvcktleXMiLCJzZXQiLCJjdXJyZW50RXhwb3J0QWxsIiwiZ2V0RGVwZW5kZW5jeSIsImRlcGVuZGVuY3kiLCJ2YWx1ZSIsImtleSIsIndoZXJlVXNlZCIsInJlZXhwb3J0IiwiZ2V0SW1wb3J0IiwibG9jYWxJbXBvcnQiLCJjdXJyZW50VmFsdWUiLCJsb2NhbCIsImltcG9ydGVkU3BlY2lmaWVycyIsInNwZWNpZmllciIsImhhcyIsInZhbCIsImN1cnJlbnRFeHBvcnQiLCJkZXRlcm1pbmVVc2FnZSIsImxpc3RWYWx1ZSIsImxpc3RLZXkiLCJjdXJyZW50SW1wb3J0IiwiZXhwb3J0U3RhdGVtZW50IiwiZ2V0U3JjIiwicHJvY2VzcyIsImN3ZCIsImxhc3RQcmVwYXJlS2V5IiwiZG9QcmVwYXJhdGlvbiIsInByZXBhcmVLZXkiLCJKU09OIiwic3RyaW5naWZ5Iiwic29ydCIsImNsZWFyIiwibmV3TmFtZXNwYWNlSW1wb3J0RXhpc3RzIiwic3BlY2lmaWVycyIsInNvbWUiLCJuZXdEZWZhdWx0SW1wb3J0RXhpc3RzIiwiZmlsZUlzSW5Qa2ciLCJwa2ciLCJiYXNlUGF0aCIsImNoZWNrUGtnRmllbGRTdHJpbmciLCJwa2dGaWVsZCIsImNoZWNrUGtnRmllbGRPYmplY3QiLCJwa2dGaWVsZEZpbGVzIiwiY2hlY2tQa2dGaWVsZCIsImJpbiIsImJyb3dzZXIiLCJtYWluIiwibW9kdWxlIiwibWV0YSIsImRvY3MiLCJjYXRlZ29yeSIsImRlc2NyaXB0aW9uIiwidXJsIiwic2NoZW1hIiwicHJvcGVydGllcyIsIm1pbkl0ZW1zIiwiaXRlbXMiLCJtaW5MZW5ndGgiLCJtaXNzaW5nRXhwb3J0cyIsInVudXNlZEV4cG9ydHMiLCJub3QiLCJhbnlPZiIsInJlcXVpcmVkIiwiY3JlYXRlIiwib3B0aW9ucyIsImdldFBoeXNpY2FsRmlsZW5hbWUiLCJnZXRGaWxlbmFtZSIsImNoZWNrRXhwb3J0UHJlc2VuY2UiLCJub2RlIiwiZXhwb3J0Q291bnQiLCJuYW1lc3BhY2VJbXBvcnRzIiwic2l6ZSIsInJlcG9ydCIsImJvZHkiLCJjaGVja1VzYWdlIiwiZXhwb3J0ZWRWYWx1ZSIsImV4cG9ydHNLZXkiLCJ1cGRhdGVFeHBvcnRVc2FnZSIsIm5ld0V4cG9ydHMiLCJuZXdFeHBvcnRJZGVudGlmaWVycyIsImxlbmd0aCIsImV4cG9ydGVkIiwidXBkYXRlSW1wb3J0VXNhZ2UiLCJvbGRJbXBvcnRQYXRocyIsIm9sZE5hbWVzcGFjZUltcG9ydHMiLCJuZXdOYW1lc3BhY2VJbXBvcnRzIiwib2xkRXhwb3J0QWxsIiwibmV3RXhwb3J0QWxsIiwib2xkRGVmYXVsdEltcG9ydHMiLCJuZXdEZWZhdWx0SW1wb3J0cyIsIm9sZEltcG9ydHMiLCJuZXdJbXBvcnRzIiwicHJvY2Vzc0R5bmFtaWNJbXBvcnQiLCJzb3VyY2UiLCJwIiwiSW1wb3J0RXhwcmVzc2lvbiIsImNoaWxkIiwiQ2FsbEV4cHJlc3Npb24iLCJjYWxsZWUiLCJhcmd1bWVudHMiLCJhc3ROb2RlIiwicmVzb2x2ZWRQYXRoIiwicmF3IiwicmVwbGFjZSIsImltcG9ydGVkIiwiRXhwb3J0RGVmYXVsdERlY2xhcmF0aW9uIiwiRXhwb3J0TmFtZWREZWNsYXJhdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBTUEseUM7QUFDQTtBQUNBLHNEO0FBQ0Esa0Q7QUFDQSxxQztBQUNBO0FBQ0EsMkQ7QUFDQSx1QztBQUNBLCtDLHVWQWRBOzs7O3lZQWdCQSxJQUFJQSx1QkFBSixDQUNBLElBQUlDLDJCQUFKO0FBRUEsSUFBSTtBQUNvQkMsVUFBUSw2QkFBUixDQURwQixDQUNDRixj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YkQ7QUFjRCxTQTNSSyw0QkFBTjs7QUE2UkEsYUFBTztBQUNMLHNCQURLLG9DQUNVK0UsSUFEVixFQUNnQjtBQUNuQlMsOEJBQWtCVCxJQUFsQjtBQUNBYyw4QkFBa0JkLElBQWxCO0FBQ0FELGdDQUFvQkMsSUFBcEI7QUFDRCxXQUxJO0FBTUxxQyxnQ0FOSyxpREFNb0JyQyxJQU5wQixFQU0wQjtBQUM3Qk0sdUJBQVdOLElBQVgsRUFBaUJySCx3QkFBakI7QUFDRCxXQVJJO0FBU0wySiw4QkFUSywrQ0FTa0J0QyxJQVRsQixFQVN3QjtBQUMzQkEsaUJBQUtuQyxVQUFMLENBQWdCakUsT0FBaEIsQ0FBd0IsVUFBQzZDLFNBQUQsRUFBZTtBQUNyQzZELHlCQUFXTixJQUFYLEVBQWlCdkQsVUFBVW9FLFFBQVYsQ0FBbUJuSCxJQUFuQixJQUEyQitDLFVBQVVvRSxRQUFWLENBQW1CN0UsS0FBL0Q7QUFDRCxhQUZEO0FBR0EzQyx5Q0FBNkIyRyxLQUFLMUcsV0FBbEMsRUFBK0MsVUFBQ0ksSUFBRCxFQUFVO0FBQ3ZENEcseUJBQVdOLElBQVgsRUFBaUJ0RyxJQUFqQjtBQUNELGFBRkQ7QUFHRCxXQWhCSSxtQ0FBUDs7QUFrQkQsS0F0aUJjLG1CQUFqQiIsImZpbGUiOiJuby11bnVzZWQtbW9kdWxlcy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGZpbGVPdmVydmlldyBFbnN1cmVzIHRoYXQgbW9kdWxlcyBjb250YWluIGV4cG9ydHMgYW5kL29yIGFsbFxuICogbW9kdWxlcyBhcmUgY29uc3VtZWQgd2l0aGluIG90aGVyIG1vZHVsZXMuXG4gKiBAYXV0aG9yIFJlbsOpIEZlcm1hbm5cbiAqL1xuXG5pbXBvcnQgRXhwb3J0cywgeyByZWN1cnNpdmVQYXR0ZXJuQ2FwdHVyZSB9IGZyb20gJy4uL0V4cG9ydE1hcCc7XG5pbXBvcnQgeyBnZXRGaWxlRXh0ZW5zaW9ucyB9IGZyb20gJ2VzbGludC1tb2R1bGUtdXRpbHMvaWdub3JlJztcbmltcG9ydCByZXNvbHZlIGZyb20gJ2VzbGludC1tb2R1bGUtdXRpbHMvcmVzb2x2ZSc7XG5pbXBvcnQgdmlzaXQgZnJvbSAnZXNsaW50LW1vZHVsZS11dGlscy92aXNpdCc7XG5pbXBvcnQgZG9jc1VybCBmcm9tICcuLi9kb2NzVXJsJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tICdwYXRoJztcbmltcG9ydCByZWFkUGtnVXAgZnJvbSAnZXNsaW50LW1vZHVsZS11dGlscy9yZWFkUGtnVXAnO1xuaW1wb3J0IHZhbHVlcyBmcm9tICdvYmplY3QudmFsdWVzJztcbmltcG9ydCBpbmNsdWRlcyBmcm9tICdhcnJheS1pbmNsdWRlcyc7XG5cbmxldCBGaWxlRW51bWVyYXRvcjtcbmxldCBsaXN0RmlsZXNUb1Byb2Nlc3M7XG5cbnRyeSB7XG4gICh7IEZpbGVFbnVtZXJhdG9yIH0gPSByZXF1aXJlKCdlc2xpbnQvdXNlLWF0LXlvdXItb3duLXJpc2snKSk7XG59IGNhdGNoIChlKSB7XG4gIHRyeSB7XG4gICAgLy8gaGFzIGJlZW4gbW92ZWQgdG8gZXNsaW50L2xpYi9jbGktZW5naW5lL2ZpbGUtZW51bWVyYXRvciBpbiB2ZXJzaW9uIDZcbiAgICAoeyBGaWxlRW51bWVyYXRvciB9ID0gcmVxdWlyZSgnZXNsaW50L2xpYi9jbGktZW5naW5lL2ZpbGUtZW51bWVyYXRvcicpKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHRyeSB7XG4gICAgICAvLyBlc2xpbnQvbGliL3V0aWwvZ2xvYi11dGlsIGhhcyBiZWVuIG1vdmVkIHRvIGVzbGludC9saWIvdXRpbC9nbG9iLXV0aWxzIHdpdGggdmVyc2lvbiA1LjNcbiAgICAgIGNvbnN0IHsgbGlzdEZpbGVzVG9Qcm9jZXNzOiBvcmlnaW5hbExpc3RGaWxlc1RvUHJvY2VzcyB9ID0gcmVxdWlyZSgnZXNsaW50L2xpYi91dGlsL2dsb2ItdXRpbHMnKTtcblxuICAgICAgLy8gUHJldmVudCBwYXNzaW5nIGludmFsaWQgb3B0aW9ucyAoZXh0ZW5zaW9ucyBhcnJheSkgdG8gb2xkIHZlcnNpb25zIG9mIHRoZSBmdW5jdGlvbi5cbiAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9lc2xpbnQvZXNsaW50L2Jsb2IvdjUuMTYuMC9saWIvdXRpbC9nbG9iLXV0aWxzLmpzI0wxNzgtTDI4MFxuICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2VzbGludC9lc2xpbnQvYmxvYi92NS4yLjAvbGliL3V0aWwvZ2xvYi11dGlsLmpzI0wxNzQtTDI2OVxuICAgICAgbGlzdEZpbGVzVG9Qcm9jZXNzID0gZnVuY3Rpb24gKHNyYywgZXh0ZW5zaW9ucykge1xuICAgICAgICByZXR1cm4gb3JpZ2luYWxMaXN0RmlsZXNUb1Byb2Nlc3Moc3JjLCB7XG4gICAgICAgICAgZXh0ZW5zaW9ucyxcbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IHsgbGlzdEZpbGVzVG9Qcm9jZXNzOiBvcmlnaW5hbExpc3RGaWxlc1RvUHJvY2VzcyB9ID0gcmVxdWlyZSgnZXNsaW50L2xpYi91dGlsL2dsb2ItdXRpbCcpO1xuXG4gICAgICBsaXN0RmlsZXNUb1Byb2Nlc3MgPSBmdW5jdGlvbiAoc3JjLCBleHRlbnNpb25zKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gc3JjLnJlZHVjZShcbiAgICAgICAgICAoY2FycnksIHBhdHRlcm4pID0+IGNhcnJ5LmNvbmNhdChcbiAgICAgICAgICAgIGV4dGVuc2lvbnMubWFwKChleHRlbnNpb24pID0+ICgvXFwqXFwqfFxcKlxcLi8pLnRlc3QocGF0dGVybikgPyBwYXR0ZXJuIDogYCR7cGF0dGVybn0vKiovKiR7ZXh0ZW5zaW9ufWApLFxuICAgICAgICAgICksXG4gICAgICAgICAgc3JjLFxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBvcmlnaW5hbExpc3RGaWxlc1RvUHJvY2VzcyhwYXR0ZXJucyk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxufVxuXG5pZiAoRmlsZUVudW1lcmF0b3IpIHtcbiAgbGlzdEZpbGVzVG9Qcm9jZXNzID0gZnVuY3Rpb24gKHNyYywgZXh0ZW5zaW9ucykge1xuICAgIGNvbnN0IGUgPSBuZXcgRmlsZUVudW1lcmF0b3Ioe1xuICAgICAgZXh0ZW5zaW9ucyxcbiAgICB9KTtcblxuICAgIHJldHVybiBBcnJheS5mcm9tKGUuaXRlcmF0ZUZpbGVzKHNyYyksICh7IGZpbGVQYXRoLCBpZ25vcmVkIH0pID0+ICh7XG4gICAgICBpZ25vcmVkLFxuICAgICAgZmlsZW5hbWU6IGZpbGVQYXRoLFxuICAgIH0pKTtcbiAgfTtcbn1cblxuY29uc3QgRVhQT1JUX0RFRkFVTFRfREVDTEFSQVRJT04gPSAnRXhwb3J0RGVmYXVsdERlY2xhcmF0aW9uJztcbmNvbnN0IEVYUE9SVF9OQU1FRF9ERUNMQVJBVElPTiA9ICdFeHBvcnROYW1lZERlY2xhcmF0aW9uJztcbmNvbnN0IEVYUE9SVF9BTExfREVDTEFSQVRJT04gPSAnRXhwb3J0QWxsRGVjbGFyYXRpb24nO1xuY29uc3QgSU1QT1JUX0RFQ0xBUkFUSU9OID0gJ0ltcG9ydERlY2xhcmF0aW9uJztcbmNvbnN0IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSID0gJ0ltcG9ydE5hbWVzcGFjZVNwZWNpZmllcic7XG5jb25zdCBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIgPSAnSW1wb3J0RGVmYXVsdFNwZWNpZmllcic7XG5jb25zdCBWQVJJQUJMRV9ERUNMQVJBVElPTiA9ICdWYXJpYWJsZURlY2xhcmF0aW9uJztcbmNvbnN0IEZVTkNUSU9OX0RFQ0xBUkFUSU9OID0gJ0Z1bmN0aW9uRGVjbGFyYXRpb24nO1xuY29uc3QgQ0xBU1NfREVDTEFSQVRJT04gPSAnQ2xhc3NEZWNsYXJhdGlvbic7XG5jb25zdCBJREVOVElGSUVSID0gJ0lkZW50aWZpZXInO1xuY29uc3QgT0JKRUNUX1BBVFRFUk4gPSAnT2JqZWN0UGF0dGVybic7XG5jb25zdCBUU19JTlRFUkZBQ0VfREVDTEFSQVRJT04gPSAnVFNJbnRlcmZhY2VEZWNsYXJhdGlvbic7XG5jb25zdCBUU19UWVBFX0FMSUFTX0RFQ0xBUkFUSU9OID0gJ1RTVHlwZUFsaWFzRGVjbGFyYXRpb24nO1xuY29uc3QgVFNfRU5VTV9ERUNMQVJBVElPTiA9ICdUU0VudW1EZWNsYXJhdGlvbic7XG5jb25zdCBERUZBVUxUID0gJ2RlZmF1bHQnO1xuXG5mdW5jdGlvbiBmb3JFYWNoRGVjbGFyYXRpb25JZGVudGlmaWVyKGRlY2xhcmF0aW9uLCBjYikge1xuICBpZiAoZGVjbGFyYXRpb24pIHtcbiAgICBpZiAoXG4gICAgICBkZWNsYXJhdGlvbi50eXBlID09PSBGVU5DVElPTl9ERUNMQVJBVElPTlxuICAgICAgfHwgZGVjbGFyYXRpb24udHlwZSA9PT0gQ0xBU1NfREVDTEFSQVRJT05cbiAgICAgIHx8IGRlY2xhcmF0aW9uLnR5cGUgPT09IFRTX0lOVEVSRkFDRV9ERUNMQVJBVElPTlxuICAgICAgfHwgZGVjbGFyYXRpb24udHlwZSA9PT0gVFNfVFlQRV9BTElBU19ERUNMQVJBVElPTlxuICAgICAgfHwgZGVjbGFyYXRpb24udHlwZSA9PT0gVFNfRU5VTV9ERUNMQVJBVElPTlxuICAgICkge1xuICAgICAgY2IoZGVjbGFyYXRpb24uaWQubmFtZSk7XG4gICAgfSBlbHNlIGlmIChkZWNsYXJhdGlvbi50eXBlID09PSBWQVJJQUJMRV9ERUNMQVJBVElPTikge1xuICAgICAgZGVjbGFyYXRpb24uZGVjbGFyYXRpb25zLmZvckVhY2goKHsgaWQgfSkgPT4ge1xuICAgICAgICBpZiAoaWQudHlwZSA9PT0gT0JKRUNUX1BBVFRFUk4pIHtcbiAgICAgICAgICByZWN1cnNpdmVQYXR0ZXJuQ2FwdHVyZShpZCwgKHBhdHRlcm4pID0+IHtcbiAgICAgICAgICAgIGlmIChwYXR0ZXJuLnR5cGUgPT09IElERU5USUZJRVIpIHtcbiAgICAgICAgICAgICAgY2IocGF0dGVybi5uYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYihpZC5uYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogTGlzdCBvZiBpbXBvcnRzIHBlciBmaWxlLlxuICpcbiAqIFJlcHJlc2VudGVkIGJ5IGEgdHdvLWxldmVsIE1hcCB0byBhIFNldCBvZiBpZGVudGlmaWVycy4gVGhlIHVwcGVyLWxldmVsIE1hcFxuICoga2V5cyBhcmUgdGhlIHBhdGhzIHRvIHRoZSBtb2R1bGVzIGNvbnRhaW5pbmcgdGhlIGltcG9ydHMsIHdoaWxlIHRoZVxuICogbG93ZXItbGV2ZWwgTWFwIGtleXMgYXJlIHRoZSBwYXRocyB0byB0aGUgZmlsZXMgd2hpY2ggYXJlIGJlaW5nIGltcG9ydGVkXG4gKiBmcm9tLiBMYXN0bHksIHRoZSBTZXQgb2YgaWRlbnRpZmllcnMgY29udGFpbnMgZWl0aGVyIG5hbWVzIGJlaW5nIGltcG9ydGVkXG4gKiBvciBhIHNwZWNpYWwgQVNUIG5vZGUgbmFtZSBsaXN0ZWQgYWJvdmUgKGUuZyBJbXBvcnREZWZhdWx0U3BlY2lmaWVyKS5cbiAqXG4gKiBGb3IgZXhhbXBsZSwgaWYgd2UgaGF2ZSBhIGZpbGUgbmFtZWQgZm9vLmpzIGNvbnRhaW5pbmc6XG4gKlxuICogICBpbXBvcnQgeyBvMiB9IGZyb20gJy4vYmFyLmpzJztcbiAqXG4gKiBUaGVuIHdlIHdpbGwgaGF2ZSBhIHN0cnVjdHVyZSB0aGF0IGxvb2tzIGxpa2U6XG4gKlxuICogICBNYXAgeyAnZm9vLmpzJyA9PiBNYXAgeyAnYmFyLmpzJyA9PiBTZXQgeyAnbzInIH0gfSB9XG4gKlxuICogQHR5cGUge01hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+Pj59XG4gKi9cbmNvbnN0IGltcG9ydExpc3QgPSBuZXcgTWFwKCk7XG5cbi8qKlxuICogTGlzdCBvZiBleHBvcnRzIHBlciBmaWxlLlxuICpcbiAqIFJlcHJlc2VudGVkIGJ5IGEgdHdvLWxldmVsIE1hcCB0byBhbiBvYmplY3Qgb2YgbWV0YWRhdGEuIFRoZSB1cHBlci1sZXZlbCBNYXBcbiAqIGtleXMgYXJlIHRoZSBwYXRocyB0byB0aGUgbW9kdWxlcyBjb250YWluaW5nIHRoZSBleHBvcnRzLCB3aGlsZSB0aGVcbiAqIGxvd2VyLWxldmVsIE1hcCBrZXlzIGFyZSB0aGUgc3BlY2lmaWMgaWRlbnRpZmllcnMgb3Igc3BlY2lhbCBBU1Qgbm9kZSBuYW1lc1xuICogYmVpbmcgZXhwb3J0ZWQuIFRoZSBsZWFmLWxldmVsIG1ldGFkYXRhIG9iamVjdCBhdCB0aGUgbW9tZW50IG9ubHkgY29udGFpbnMgYVxuICogYHdoZXJlVXNlZGAgcHJvcGVydHksIHdoaWNoIGNvbnRhaW5zIGEgU2V0IG9mIHBhdGhzIHRvIG1vZHVsZXMgdGhhdCBpbXBvcnRcbiAqIHRoZSBuYW1lLlxuICpcbiAqIEZvciBleGFtcGxlLCBpZiB3ZSBoYXZlIGEgZmlsZSBuYW1lZCBiYXIuanMgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIGV4cG9ydHM6XG4gKlxuICogICBjb25zdCBvMiA9ICdiYXInO1xuICogICBleHBvcnQgeyBvMiB9O1xuICpcbiAqIEFuZCBhIGZpbGUgbmFtZWQgZm9vLmpzIGNvbnRhaW5pbmcgdGhlIGZvbGxvd2luZyBpbXBvcnQ6XG4gKlxuICogICBpbXBvcnQgeyBvMiB9IGZyb20gJy4vYmFyLmpzJztcbiAqXG4gKiBUaGVuIHdlIHdpbGwgaGF2ZSBhIHN0cnVjdHVyZSB0aGF0IGxvb2tzIGxpa2U6XG4gKlxuICogICBNYXAgeyAnYmFyLmpzJyA9PiBNYXAgeyAnbzInID0+IHsgd2hlcmVVc2VkOiBTZXQgeyAnZm9vLmpzJyB9IH0gfSB9XG4gKlxuICogQHR5cGUge01hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIG9iamVjdD4+fVxuICovXG5jb25zdCBleHBvcnRMaXN0ID0gbmV3IE1hcCgpO1xuXG5jb25zdCB2aXNpdG9yS2V5TWFwID0gbmV3IE1hcCgpO1xuXG5jb25zdCBpZ25vcmVkRmlsZXMgPSBuZXcgU2V0KCk7XG5jb25zdCBmaWxlc091dHNpZGVTcmMgPSBuZXcgU2V0KCk7XG5cbmNvbnN0IGlzTm9kZU1vZHVsZSA9IChwYXRoKSA9PiAoL1xcLyhub2RlX21vZHVsZXMpXFwvLykudGVzdChwYXRoKTtcblxuLyoqXG4gKiByZWFkIGFsbCBmaWxlcyBtYXRjaGluZyB0aGUgcGF0dGVybnMgaW4gc3JjIGFuZCBpZ25vcmVFeHBvcnRzXG4gKlxuICogcmV0dXJuIGFsbCBmaWxlcyBtYXRjaGluZyBzcmMgcGF0dGVybiwgd2hpY2ggYXJlIG5vdCBtYXRjaGluZyB0aGUgaWdub3JlRXhwb3J0cyBwYXR0ZXJuXG4gKi9cbmNvbnN0IHJlc29sdmVGaWxlcyA9IChzcmMsIGlnbm9yZUV4cG9ydHMsIGNvbnRleHQpID0+IHtcbiAgY29uc3QgZXh0ZW5zaW9ucyA9IEFycmF5LmZyb20oZ2V0RmlsZUV4dGVuc2lvbnMoY29udGV4dC5zZXR0aW5ncykpO1xuXG4gIGNvbnN0IHNyY0ZpbGVzID0gbmV3IFNldCgpO1xuICBjb25zdCBzcmNGaWxlTGlzdCA9IGxpc3RGaWxlc1RvUHJvY2VzcyhzcmMsIGV4dGVuc2lvbnMpO1xuXG4gIC8vIHByZXBhcmUgbGlzdCBvZiBpZ25vcmVkIGZpbGVzXG4gIGNvbnN0IGlnbm9yZWRGaWxlc0xpc3QgPSAgbGlzdEZpbGVzVG9Qcm9jZXNzKGlnbm9yZUV4cG9ydHMsIGV4dGVuc2lvbnMpO1xuICBpZ25vcmVkRmlsZXNMaXN0LmZvckVhY2goKHsgZmlsZW5hbWUgfSkgPT4gaWdub3JlZEZpbGVzLmFkZChmaWxlbmFtZSkpO1xuXG4gIC8vIHByZXBhcmUgbGlzdCBvZiBzb3VyY2UgZmlsZXMsIGRvbid0IGNvbnNpZGVyIGZpbGVzIGZyb20gbm9kZV9tb2R1bGVzXG4gIHNyY0ZpbGVMaXN0LmZpbHRlcigoeyBmaWxlbmFtZSB9KSA9PiAhaXNOb2RlTW9kdWxlKGZpbGVuYW1lKSkuZm9yRWFjaCgoeyBmaWxlbmFtZSB9KSA9PiB7XG4gICAgc3JjRmlsZXMuYWRkKGZpbGVuYW1lKTtcbiAgfSk7XG4gIHJldHVybiBzcmNGaWxlcztcbn07XG5cbi8qKlxuICogcGFyc2UgYWxsIHNvdXJjZSBmaWxlcyBhbmQgYnVpbGQgdXAgMiBtYXBzIGNvbnRhaW5pbmcgdGhlIGV4aXN0aW5nIGltcG9ydHMgYW5kIGV4cG9ydHNcbiAqL1xuY29uc3QgcHJlcGFyZUltcG9ydHNBbmRFeHBvcnRzID0gKHNyY0ZpbGVzLCBjb250ZXh0KSA9PiB7XG4gIGNvbnN0IGV4cG9ydEFsbCA9IG5ldyBNYXAoKTtcbiAgc3JjRmlsZXMuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgIGNvbnN0IGV4cG9ydHMgPSBuZXcgTWFwKCk7XG4gICAgY29uc3QgaW1wb3J0cyA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBjdXJyZW50RXhwb3J0cyA9IEV4cG9ydHMuZ2V0KGZpbGUsIGNvbnRleHQpO1xuICAgIGlmIChjdXJyZW50RXhwb3J0cykge1xuICAgICAgY29uc3Qge1xuICAgICAgICBkZXBlbmRlbmNpZXMsXG4gICAgICAgIHJlZXhwb3J0cyxcbiAgICAgICAgaW1wb3J0czogbG9jYWxJbXBvcnRMaXN0LFxuICAgICAgICBuYW1lc3BhY2UsXG4gICAgICAgIHZpc2l0b3JLZXlzLFxuICAgICAgfSA9IGN1cnJlbnRFeHBvcnRzO1xuXG4gICAgICB2aXNpdG9yS2V5TWFwLnNldChmaWxlLCB2aXNpdG9yS2V5cyk7XG4gICAgICAvLyBkZXBlbmRlbmNpZXMgPT09IGV4cG9ydCAqIGZyb21cbiAgICAgIGNvbnN0IGN1cnJlbnRFeHBvcnRBbGwgPSBuZXcgU2V0KCk7XG4gICAgICBkZXBlbmRlbmNpZXMuZm9yRWFjaCgoZ2V0RGVwZW5kZW5jeSkgPT4ge1xuICAgICAgICBjb25zdCBkZXBlbmRlbmN5ID0gZ2V0RGVwZW5kZW5jeSgpO1xuICAgICAgICBpZiAoZGVwZW5kZW5jeSA9PT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGN1cnJlbnRFeHBvcnRBbGwuYWRkKGRlcGVuZGVuY3kucGF0aCk7XG4gICAgICB9KTtcbiAgICAgIGV4cG9ydEFsbC5zZXQoZmlsZSwgY3VycmVudEV4cG9ydEFsbCk7XG5cbiAgICAgIHJlZXhwb3J0cy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09IERFRkFVTFQpIHtcbiAgICAgICAgICBleHBvcnRzLnNldChJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIsIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZXhwb3J0cy5zZXQoa2V5LCB7IHdoZXJlVXNlZDogbmV3IFNldCgpIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlZXhwb3J0ID0gIHZhbHVlLmdldEltcG9ydCgpO1xuICAgICAgICBpZiAoIXJlZXhwb3J0KSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGxldCBsb2NhbEltcG9ydCA9IGltcG9ydHMuZ2V0KHJlZXhwb3J0LnBhdGgpO1xuICAgICAgICBsZXQgY3VycmVudFZhbHVlO1xuICAgICAgICBpZiAodmFsdWUubG9jYWwgPT09IERFRkFVTFQpIHtcbiAgICAgICAgICBjdXJyZW50VmFsdWUgPSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY3VycmVudFZhbHVlID0gdmFsdWUubG9jYWw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBsb2NhbEltcG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBsb2NhbEltcG9ydCA9IG5ldyBTZXQoWy4uLmxvY2FsSW1wb3J0LCBjdXJyZW50VmFsdWVdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsb2NhbEltcG9ydCA9IG5ldyBTZXQoW2N1cnJlbnRWYWx1ZV0pO1xuICAgICAgICB9XG4gICAgICAgIGltcG9ydHMuc2V0KHJlZXhwb3J0LnBhdGgsIGxvY2FsSW1wb3J0KTtcbiAgICAgIH0pO1xuXG4gICAgICBsb2NhbEltcG9ydExpc3QuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAoaXNOb2RlTW9kdWxlKGtleSkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbG9jYWxJbXBvcnQgPSBpbXBvcnRzLmdldChrZXkpIHx8IG5ldyBTZXQoKTtcbiAgICAgICAgdmFsdWUuZGVjbGFyYXRpb25zLmZvckVhY2goKHsgaW1wb3J0ZWRTcGVjaWZpZXJzIH0pID0+IHtcbiAgICAgICAgICBpbXBvcnRlZFNwZWNpZmllcnMuZm9yRWFjaCgoc3BlY2lmaWVyKSA9PiB7XG4gICAgICAgICAgICBsb2NhbEltcG9ydC5hZGQoc3BlY2lmaWVyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGltcG9ydHMuc2V0KGtleSwgbG9jYWxJbXBvcnQpO1xuICAgICAgfSk7XG4gICAgICBpbXBvcnRMaXN0LnNldChmaWxlLCBpbXBvcnRzKTtcblxuICAgICAgLy8gYnVpbGQgdXAgZXhwb3J0IGxpc3Qgb25seSwgaWYgZmlsZSBpcyBub3QgaWdub3JlZFxuICAgICAgaWYgKGlnbm9yZWRGaWxlcy5oYXMoZmlsZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbmFtZXNwYWNlLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gREVGQVVMVCkge1xuICAgICAgICAgIGV4cG9ydHMuc2V0KElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiwgeyB3aGVyZVVzZWQ6IG5ldyBTZXQoKSB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBleHBvcnRzLnNldChrZXksIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBleHBvcnRzLnNldChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OLCB7IHdoZXJlVXNlZDogbmV3IFNldCgpIH0pO1xuICAgIGV4cG9ydHMuc2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSLCB7IHdoZXJlVXNlZDogbmV3IFNldCgpIH0pO1xuICAgIGV4cG9ydExpc3Quc2V0KGZpbGUsIGV4cG9ydHMpO1xuICB9KTtcbiAgZXhwb3J0QWxsLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICB2YWx1ZS5mb3JFYWNoKCh2YWwpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRFeHBvcnRzID0gZXhwb3J0TGlzdC5nZXQodmFsKTtcbiAgICAgIGlmIChjdXJyZW50RXhwb3J0cykge1xuICAgICAgICBjb25zdCBjdXJyZW50RXhwb3J0ID0gY3VycmVudEV4cG9ydHMuZ2V0KEVYUE9SVF9BTExfREVDTEFSQVRJT04pO1xuICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5hZGQoa2V5KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIHRyYXZlcnNlIHRocm91Z2ggYWxsIGltcG9ydHMgYW5kIGFkZCB0aGUgcmVzcGVjdGl2ZSBwYXRoIHRvIHRoZSB3aGVyZVVzZWQtbGlzdFxuICogb2YgdGhlIGNvcnJlc3BvbmRpbmcgZXhwb3J0XG4gKi9cbmNvbnN0IGRldGVybWluZVVzYWdlID0gKCkgPT4ge1xuICBpbXBvcnRMaXN0LmZvckVhY2goKGxpc3RWYWx1ZSwgbGlzdEtleSkgPT4ge1xuICAgIGxpc3RWYWx1ZS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICBjb25zdCBleHBvcnRzID0gZXhwb3J0TGlzdC5nZXQoa2V5KTtcbiAgICAgIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgdmFsdWUuZm9yRWFjaCgoY3VycmVudEltcG9ydCkgPT4ge1xuICAgICAgICAgIGxldCBzcGVjaWZpZXI7XG4gICAgICAgICAgaWYgKGN1cnJlbnRJbXBvcnQgPT09IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKSB7XG4gICAgICAgICAgICBzcGVjaWZpZXIgPSBJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUjtcbiAgICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRJbXBvcnQgPT09IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUikge1xuICAgICAgICAgICAgc3BlY2lmaWVyID0gSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzcGVjaWZpZXIgPSBjdXJyZW50SW1wb3J0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHNwZWNpZmllciAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGNvbnN0IGV4cG9ydFN0YXRlbWVudCA9IGV4cG9ydHMuZ2V0KHNwZWNpZmllcik7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydFN0YXRlbWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgY29uc3QgeyB3aGVyZVVzZWQgfSA9IGV4cG9ydFN0YXRlbWVudDtcbiAgICAgICAgICAgICAgd2hlcmVVc2VkLmFkZChsaXN0S2V5KTtcbiAgICAgICAgICAgICAgZXhwb3J0cy5zZXQoc3BlY2lmaWVyLCB7IHdoZXJlVXNlZCB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbmNvbnN0IGdldFNyYyA9IChzcmMpID0+IHtcbiAgaWYgKHNyYykge1xuICAgIHJldHVybiBzcmM7XG4gIH1cbiAgcmV0dXJuIFtwcm9jZXNzLmN3ZCgpXTtcbn07XG5cbi8qKlxuICogcHJlcGFyZSB0aGUgbGlzdHMgb2YgZXhpc3RpbmcgaW1wb3J0cyBhbmQgZXhwb3J0cyAtIHNob3VsZCBvbmx5IGJlIGV4ZWN1dGVkIG9uY2UgYXRcbiAqIHRoZSBzdGFydCBvZiBhIG5ldyBlc2xpbnQgcnVuXG4gKi9cbmxldCBzcmNGaWxlcztcbmxldCBsYXN0UHJlcGFyZUtleTtcbmNvbnN0IGRvUHJlcGFyYXRpb24gPSAoc3JjLCBpZ25vcmVFeHBvcnRzLCBjb250ZXh0KSA9PiB7XG4gIGNvbnN0IHByZXBhcmVLZXkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgc3JjOiAoc3JjIHx8IFtdKS5zb3J0KCksXG4gICAgaWdub3JlRXhwb3J0czogKGlnbm9yZUV4cG9ydHMgfHwgW10pLnNvcnQoKSxcbiAgICBleHRlbnNpb25zOiBBcnJheS5mcm9tKGdldEZpbGVFeHRlbnNpb25zKGNvbnRleHQuc2V0dGluZ3MpKS5zb3J0KCksXG4gIH0pO1xuICBpZiAocHJlcGFyZUtleSA9PT0gbGFzdFByZXBhcmVLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpbXBvcnRMaXN0LmNsZWFyKCk7XG4gIGV4cG9ydExpc3QuY2xlYXIoKTtcbiAgaWdub3JlZEZpbGVzLmNsZWFyKCk7XG4gIGZpbGVzT3V0c2lkZVNyYy5jbGVhcigpO1xuXG4gIHNyY0ZpbGVzID0gcmVzb2x2ZUZpbGVzKGdldFNyYyhzcmMpLCBpZ25vcmVFeHBvcnRzLCBjb250ZXh0KTtcbiAgcHJlcGFyZUltcG9ydHNBbmRFeHBvcnRzKHNyY0ZpbGVzLCBjb250ZXh0KTtcbiAgZGV0ZXJtaW5lVXNhZ2UoKTtcbiAgbGFzdFByZXBhcmVLZXkgPSBwcmVwYXJlS2V5O1xufTtcblxuY29uc3QgbmV3TmFtZXNwYWNlSW1wb3J0RXhpc3RzID0gKHNwZWNpZmllcnMpID0+IHNwZWNpZmllcnMuc29tZSgoeyB0eXBlIH0pID0+IHR5cGUgPT09IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKTtcblxuY29uc3QgbmV3RGVmYXVsdEltcG9ydEV4aXN0cyA9IChzcGVjaWZpZXJzKSA9PiBzcGVjaWZpZXJzLnNvbWUoKHsgdHlwZSB9KSA9PiB0eXBlID09PSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIpO1xuXG5jb25zdCBmaWxlSXNJblBrZyA9IChmaWxlKSA9PiB7XG4gIGNvbnN0IHsgcGF0aCwgcGtnIH0gPSByZWFkUGtnVXAoeyBjd2Q6IGZpbGUgfSk7XG4gIGNvbnN0IGJhc2VQYXRoID0gZGlybmFtZShwYXRoKTtcblxuICBjb25zdCBjaGVja1BrZ0ZpZWxkU3RyaW5nID0gKHBrZ0ZpZWxkKSA9PiB7XG4gICAgaWYgKGpvaW4oYmFzZVBhdGgsIHBrZ0ZpZWxkKSA9PT0gZmlsZSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGNoZWNrUGtnRmllbGRPYmplY3QgPSAocGtnRmllbGQpID0+IHtcbiAgICBjb25zdCBwa2dGaWVsZEZpbGVzID0gdmFsdWVzKHBrZ0ZpZWxkKVxuICAgICAgLmZpbHRlcigodmFsdWUpID0+IHR5cGVvZiB2YWx1ZSAhPT0gJ2Jvb2xlYW4nKVxuICAgICAgLm1hcCgodmFsdWUpID0+IGpvaW4oYmFzZVBhdGgsIHZhbHVlKSk7XG5cbiAgICBpZiAoaW5jbHVkZXMocGtnRmllbGRGaWxlcywgZmlsZSkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBjaGVja1BrZ0ZpZWxkID0gKHBrZ0ZpZWxkKSA9PiB7XG4gICAgaWYgKHR5cGVvZiBwa2dGaWVsZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBjaGVja1BrZ0ZpZWxkU3RyaW5nKHBrZ0ZpZWxkKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHBrZ0ZpZWxkID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIGNoZWNrUGtnRmllbGRPYmplY3QocGtnRmllbGQpO1xuICAgIH1cbiAgfTtcblxuICBpZiAocGtnLnByaXZhdGUgPT09IHRydWUpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAocGtnLmJpbikge1xuICAgIGlmIChjaGVja1BrZ0ZpZWxkKHBrZy5iaW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAocGtnLmJyb3dzZXIpIHtcbiAgICBpZiAoY2hlY2tQa2dGaWVsZChwa2cuYnJvd3NlcikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwa2cubWFpbikge1xuICAgIGlmIChjaGVja1BrZ0ZpZWxkU3RyaW5nKHBrZy5tYWluKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1ldGE6IHtcbiAgICB0eXBlOiAnc3VnZ2VzdGlvbicsXG4gICAgZG9jczoge1xuICAgICAgY2F0ZWdvcnk6ICdIZWxwZnVsIHdhcm5pbmdzJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRm9yYmlkIG1vZHVsZXMgd2l0aG91dCBleHBvcnRzLCBvciBleHBvcnRzIHdpdGhvdXQgbWF0Y2hpbmcgaW1wb3J0IGluIGFub3RoZXIgbW9kdWxlLicsXG4gICAgICB1cmw6IGRvY3NVcmwoJ25vLXVudXNlZC1tb2R1bGVzJyksXG4gICAgfSxcbiAgICBzY2hlbWE6IFt7XG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIHNyYzoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnZmlsZXMvcGF0aHMgdG8gYmUgYW5hbHl6ZWQgKG9ubHkgZm9yIHVudXNlZCBleHBvcnRzKScsXG4gICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICBtaW5JdGVtczogMSxcbiAgICAgICAgICBpdGVtczoge1xuICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICBtaW5MZW5ndGg6IDEsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgaWdub3JlRXhwb3J0czoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICAgJ2ZpbGVzL3BhdGhzIGZvciB3aGljaCB1bnVzZWQgZXhwb3J0cyB3aWxsIG5vdCBiZSByZXBvcnRlZCAoZS5nIG1vZHVsZSBlbnRyeSBwb2ludHMpJyxcbiAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIG1pbkl0ZW1zOiAxLFxuICAgICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgIG1pbkxlbmd0aDogMSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBtaXNzaW5nRXhwb3J0czoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAncmVwb3J0IG1vZHVsZXMgd2l0aG91dCBhbnkgZXhwb3J0cycsXG4gICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICB9LFxuICAgICAgICB1bnVzZWRFeHBvcnRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdyZXBvcnQgZXhwb3J0cyB3aXRob3V0IGFueSB1c2FnZScsXG4gICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG5vdDoge1xuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgdW51c2VkRXhwb3J0czogeyBlbnVtOiBbZmFsc2VdIH0sXG4gICAgICAgICAgbWlzc2luZ0V4cG9ydHM6IHsgZW51bTogW2ZhbHNlXSB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGFueU9mOiBbe1xuICAgICAgICBub3Q6IHtcbiAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICB1bnVzZWRFeHBvcnRzOiB7IGVudW06IFt0cnVlXSB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHJlcXVpcmVkOiBbJ21pc3NpbmdFeHBvcnRzJ10sXG4gICAgICB9LCB7XG4gICAgICAgIG5vdDoge1xuICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIG1pc3NpbmdFeHBvcnRzOiB7IGVudW06IFt0cnVlXSB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHJlcXVpcmVkOiBbJ3VudXNlZEV4cG9ydHMnXSxcbiAgICAgIH0sIHtcbiAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgIHVudXNlZEV4cG9ydHM6IHsgZW51bTogW3RydWVdIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHJlcXVpcmVkOiBbJ3VudXNlZEV4cG9ydHMnXSxcbiAgICAgIH0sIHtcbiAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgIG1pc3NpbmdFeHBvcnRzOiB7IGVudW06IFt0cnVlXSB9LFxuICAgICAgICB9LFxuICAgICAgICByZXF1aXJlZDogWydtaXNzaW5nRXhwb3J0cyddLFxuICAgICAgfV0sXG4gICAgfV0sXG4gIH0sXG5cbiAgY3JlYXRlKGNvbnRleHQpIHtcbiAgICBjb25zdCB7XG4gICAgICBzcmMsXG4gICAgICBpZ25vcmVFeHBvcnRzID0gW10sXG4gICAgICBtaXNzaW5nRXhwb3J0cyxcbiAgICAgIHVudXNlZEV4cG9ydHMsXG4gICAgfSA9IGNvbnRleHQub3B0aW9uc1swXSB8fCB7fTtcblxuICAgIGlmICh1bnVzZWRFeHBvcnRzKSB7XG4gICAgICBkb1ByZXBhcmF0aW9uKHNyYywgaWdub3JlRXhwb3J0cywgY29udGV4dCk7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IGNvbnRleHQuZ2V0UGh5c2ljYWxGaWxlbmFtZSA/IGNvbnRleHQuZ2V0UGh5c2ljYWxGaWxlbmFtZSgpIDogY29udGV4dC5nZXRGaWxlbmFtZSgpO1xuXG4gICAgY29uc3QgY2hlY2tFeHBvcnRQcmVzZW5jZSA9IChub2RlKSA9PiB7XG4gICAgICBpZiAoIW1pc3NpbmdFeHBvcnRzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKGlnbm9yZWRGaWxlcy5oYXMoZmlsZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBleHBvcnRDb3VudCA9IGV4cG9ydExpc3QuZ2V0KGZpbGUpO1xuICAgICAgY29uc3QgZXhwb3J0QWxsID0gZXhwb3J0Q291bnQuZ2V0KEVYUE9SVF9BTExfREVDTEFSQVRJT04pO1xuICAgICAgY29uc3QgbmFtZXNwYWNlSW1wb3J0cyA9IGV4cG9ydENvdW50LmdldChJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUik7XG5cbiAgICAgIGV4cG9ydENvdW50LmRlbGV0ZShFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKTtcbiAgICAgIGV4cG9ydENvdW50LmRlbGV0ZShJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUik7XG4gICAgICBpZiAoZXhwb3J0Q291bnQuc2l6ZSA8IDEpIHtcbiAgICAgICAgLy8gbm9kZS5ib2R5WzBdID09PSAndW5kZWZpbmVkJyBvbmx5IGhhcHBlbnMsIGlmIGV2ZXJ5dGhpbmcgaXMgY29tbWVudGVkIG91dCBpbiB0aGUgZmlsZVxuICAgICAgICAvLyBiZWluZyBsaW50ZWRcbiAgICAgICAgY29udGV4dC5yZXBvcnQobm9kZS5ib2R5WzBdID8gbm9kZS5ib2R5WzBdIDogbm9kZSwgJ05vIGV4cG9ydHMgZm91bmQnKTtcbiAgICAgIH1cbiAgICAgIGV4cG9ydENvdW50LnNldChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OLCBleHBvcnRBbGwpO1xuICAgICAgZXhwb3J0Q291bnQuc2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSLCBuYW1lc3BhY2VJbXBvcnRzKTtcbiAgICB9O1xuXG4gICAgY29uc3QgY2hlY2tVc2FnZSA9IChub2RlLCBleHBvcnRlZFZhbHVlKSA9PiB7XG4gICAgICBpZiAoIXVudXNlZEV4cG9ydHMpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoaWdub3JlZEZpbGVzLmhhcyhmaWxlKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChmaWxlSXNJblBrZyhmaWxlKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChmaWxlc091dHNpZGVTcmMuaGFzKGZpbGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gbWFrZSBzdXJlIGZpbGUgdG8gYmUgbGludGVkIGlzIGluY2x1ZGVkIGluIHNvdXJjZSBmaWxlc1xuICAgICAgaWYgKCFzcmNGaWxlcy5oYXMoZmlsZSkpIHtcbiAgICAgICAgc3JjRmlsZXMgPSByZXNvbHZlRmlsZXMoZ2V0U3JjKHNyYyksIGlnbm9yZUV4cG9ydHMsIGNvbnRleHQpO1xuICAgICAgICBpZiAoIXNyY0ZpbGVzLmhhcyhmaWxlKSkge1xuICAgICAgICAgIGZpbGVzT3V0c2lkZVNyYy5hZGQoZmlsZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldChmaWxlKTtcblxuICAgICAgLy8gc3BlY2lhbCBjYXNlOiBleHBvcnQgKiBmcm9tXG4gICAgICBjb25zdCBleHBvcnRBbGwgPSBleHBvcnRzLmdldChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKTtcbiAgICAgIGlmICh0eXBlb2YgZXhwb3J0QWxsICE9PSAndW5kZWZpbmVkJyAmJiBleHBvcnRlZFZhbHVlICE9PSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIpIHtcbiAgICAgICAgaWYgKGV4cG9ydEFsbC53aGVyZVVzZWQuc2l6ZSA+IDApIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gc3BlY2lhbCBjYXNlOiBuYW1lc3BhY2UgaW1wb3J0XG4gICAgICBjb25zdCBuYW1lc3BhY2VJbXBvcnRzID0gZXhwb3J0cy5nZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lc3BhY2VJbXBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBpZiAobmFtZXNwYWNlSW1wb3J0cy53aGVyZVVzZWQuc2l6ZSA+IDApIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gZXhwb3J0c0xpc3Qgd2lsbCBhbHdheXMgbWFwIGFueSBpbXBvcnRlZCB2YWx1ZSBvZiAnZGVmYXVsdCcgdG8gJ0ltcG9ydERlZmF1bHRTcGVjaWZpZXInXG4gICAgICBjb25zdCBleHBvcnRzS2V5ID0gZXhwb3J0ZWRWYWx1ZSA9PT0gREVGQVVMVCA/IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiA6IGV4cG9ydGVkVmFsdWU7XG5cbiAgICAgIGNvbnN0IGV4cG9ydFN0YXRlbWVudCA9IGV4cG9ydHMuZ2V0KGV4cG9ydHNLZXkpO1xuXG4gICAgICBjb25zdCB2YWx1ZSA9IGV4cG9ydHNLZXkgPT09IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiA/IERFRkFVTFQgOiBleHBvcnRzS2V5O1xuXG4gICAgICBpZiAodHlwZW9mIGV4cG9ydFN0YXRlbWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgaWYgKGV4cG9ydFN0YXRlbWVudC53aGVyZVVzZWQuc2l6ZSA8IDEpIHtcbiAgICAgICAgICBjb250ZXh0LnJlcG9ydChcbiAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICBgZXhwb3J0ZWQgZGVjbGFyYXRpb24gJyR7dmFsdWV9JyBub3QgdXNlZCB3aXRoaW4gb3RoZXIgbW9kdWxlc2AsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29udGV4dC5yZXBvcnQoXG4gICAgICAgICAgbm9kZSxcbiAgICAgICAgICBgZXhwb3J0ZWQgZGVjbGFyYXRpb24gJyR7dmFsdWV9JyBub3QgdXNlZCB3aXRoaW4gb3RoZXIgbW9kdWxlc2AsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIG9ubHkgdXNlZnVsIGZvciB0b29scyBsaWtlIHZzY29kZS1lc2xpbnRcbiAgICAgKlxuICAgICAqIHVwZGF0ZSBsaXN0cyBvZiBleGlzdGluZyBleHBvcnRzIGR1cmluZyBydW50aW1lXG4gICAgICovXG4gICAgY29uc3QgdXBkYXRlRXhwb3J0VXNhZ2UgPSAobm9kZSkgPT4ge1xuICAgICAgaWYgKGlnbm9yZWRGaWxlcy5oYXMoZmlsZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KGZpbGUpO1xuXG4gICAgICAvLyBuZXcgbW9kdWxlIGhhcyBiZWVuIGNyZWF0ZWQgZHVyaW5nIHJ1bnRpbWVcbiAgICAgIC8vIGluY2x1ZGUgaXQgaW4gZnVydGhlciBwcm9jZXNzaW5nXG4gICAgICBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGV4cG9ydHMgPSBuZXcgTWFwKCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5ld0V4cG9ydHMgPSBuZXcgTWFwKCk7XG4gICAgICBjb25zdCBuZXdFeHBvcnRJZGVudGlmaWVycyA9IG5ldyBTZXQoKTtcblxuICAgICAgbm9kZS5ib2R5LmZvckVhY2goKHsgdHlwZSwgZGVjbGFyYXRpb24sIHNwZWNpZmllcnMgfSkgPT4ge1xuICAgICAgICBpZiAodHlwZSA9PT0gRVhQT1JUX0RFRkFVTFRfREVDTEFSQVRJT04pIHtcbiAgICAgICAgICBuZXdFeHBvcnRJZGVudGlmaWVycy5hZGQoSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZSA9PT0gRVhQT1JUX05BTUVEX0RFQ0xBUkFUSU9OKSB7XG4gICAgICAgICAgaWYgKHNwZWNpZmllcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc3BlY2lmaWVycy5mb3JFYWNoKChzcGVjaWZpZXIpID0+IHtcbiAgICAgICAgICAgICAgaWYgKHNwZWNpZmllci5leHBvcnRlZCkge1xuICAgICAgICAgICAgICAgIG5ld0V4cG9ydElkZW50aWZpZXJzLmFkZChzcGVjaWZpZXIuZXhwb3J0ZWQubmFtZSB8fCBzcGVjaWZpZXIuZXhwb3J0ZWQudmFsdWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZm9yRWFjaERlY2xhcmF0aW9uSWRlbnRpZmllcihkZWNsYXJhdGlvbiwgKG5hbWUpID0+IHtcbiAgICAgICAgICAgIG5ld0V4cG9ydElkZW50aWZpZXJzLmFkZChuYW1lKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIG9sZCBleHBvcnRzIGV4aXN0IHdpdGhpbiBsaXN0IG9mIG5ldyBleHBvcnRzIGlkZW50aWZpZXJzOiBhZGQgdG8gbWFwIG9mIG5ldyBleHBvcnRzXG4gICAgICBleHBvcnRzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKG5ld0V4cG9ydElkZW50aWZpZXJzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgbmV3RXhwb3J0cy5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBuZXcgZXhwb3J0IGlkZW50aWZpZXJzIGFkZGVkOiBhZGQgdG8gbWFwIG9mIG5ldyBleHBvcnRzXG4gICAgICBuZXdFeHBvcnRJZGVudGlmaWVycy5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAgICAgaWYgKCFleHBvcnRzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgbmV3RXhwb3J0cy5zZXQoa2V5LCB7IHdoZXJlVXNlZDogbmV3IFNldCgpIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gcHJlc2VydmUgaW5mb3JtYXRpb24gYWJvdXQgbmFtZXNwYWNlIGltcG9ydHNcbiAgICAgIGNvbnN0IGV4cG9ydEFsbCA9IGV4cG9ydHMuZ2V0KEVYUE9SVF9BTExfREVDTEFSQVRJT04pO1xuICAgICAgbGV0IG5hbWVzcGFjZUltcG9ydHMgPSBleHBvcnRzLmdldChJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUik7XG5cbiAgICAgIGlmICh0eXBlb2YgbmFtZXNwYWNlSW1wb3J0cyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgbmFtZXNwYWNlSW1wb3J0cyA9IHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfTtcbiAgICAgIH1cblxuICAgICAgbmV3RXhwb3J0cy5zZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTiwgZXhwb3J0QWxsKTtcbiAgICAgIG5ld0V4cG9ydHMuc2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSLCBuYW1lc3BhY2VJbXBvcnRzKTtcbiAgICAgIGV4cG9ydExpc3Quc2V0KGZpbGUsIG5ld0V4cG9ydHMpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBvbmx5IHVzZWZ1bCBmb3IgdG9vbHMgbGlrZSB2c2NvZGUtZXNsaW50XG4gICAgICpcbiAgICAgKiB1cGRhdGUgbGlzdHMgb2YgZXhpc3RpbmcgaW1wb3J0cyBkdXJpbmcgcnVudGltZVxuICAgICAqL1xuICAgIGNvbnN0IHVwZGF0ZUltcG9ydFVzYWdlID0gKG5vZGUpID0+IHtcbiAgICAgIGlmICghdW51c2VkRXhwb3J0cykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGxldCBvbGRJbXBvcnRQYXRocyA9IGltcG9ydExpc3QuZ2V0KGZpbGUpO1xuICAgICAgaWYgKHR5cGVvZiBvbGRJbXBvcnRQYXRocyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgb2xkSW1wb3J0UGF0aHMgPSBuZXcgTWFwKCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG9sZE5hbWVzcGFjZUltcG9ydHMgPSBuZXcgU2V0KCk7XG4gICAgICBjb25zdCBuZXdOYW1lc3BhY2VJbXBvcnRzID0gbmV3IFNldCgpO1xuXG4gICAgICBjb25zdCBvbGRFeHBvcnRBbGwgPSBuZXcgU2V0KCk7XG4gICAgICBjb25zdCBuZXdFeHBvcnRBbGwgPSBuZXcgU2V0KCk7XG5cbiAgICAgIGNvbnN0IG9sZERlZmF1bHRJbXBvcnRzID0gbmV3IFNldCgpO1xuICAgICAgY29uc3QgbmV3RGVmYXVsdEltcG9ydHMgPSBuZXcgU2V0KCk7XG5cbiAgICAgIGNvbnN0IG9sZEltcG9ydHMgPSBuZXcgTWFwKCk7XG4gICAgICBjb25zdCBuZXdJbXBvcnRzID0gbmV3IE1hcCgpO1xuICAgICAgb2xkSW1wb3J0UGF0aHMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAodmFsdWUuaGFzKEVYUE9SVF9BTExfREVDTEFSQVRJT04pKSB7XG4gICAgICAgICAgb2xkRXhwb3J0QWxsLmFkZChrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh2YWx1ZS5oYXMoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpKSB7XG4gICAgICAgICAgb2xkTmFtZXNwYWNlSW1wb3J0cy5hZGQoa2V5KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodmFsdWUuaGFzKElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUikpIHtcbiAgICAgICAgICBvbGREZWZhdWx0SW1wb3J0cy5hZGQoa2V5KTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZS5mb3JFYWNoKCh2YWwpID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICB2YWwgIT09IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSXG4gICAgICAgICAgICAmJiB2YWwgIT09IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUlxuICAgICAgICAgICkge1xuICAgICAgICAgICAgb2xkSW1wb3J0cy5zZXQodmFsLCBrZXkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgZnVuY3Rpb24gcHJvY2Vzc0R5bmFtaWNJbXBvcnQoc291cmNlKSB7XG4gICAgICAgIGlmIChzb3VyY2UudHlwZSAhPT0gJ0xpdGVyYWwnKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcCA9IHJlc29sdmUoc291cmNlLnZhbHVlLCBjb250ZXh0KTtcbiAgICAgICAgaWYgKHAgPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIG5ld05hbWVzcGFjZUltcG9ydHMuYWRkKHApO1xuICAgICAgfVxuXG4gICAgICB2aXNpdChub2RlLCB2aXNpdG9yS2V5TWFwLmdldChmaWxlKSwge1xuICAgICAgICBJbXBvcnRFeHByZXNzaW9uKGNoaWxkKSB7XG4gICAgICAgICAgcHJvY2Vzc0R5bmFtaWNJbXBvcnQoY2hpbGQuc291cmNlKTtcbiAgICAgICAgfSxcbiAgICAgICAgQ2FsbEV4cHJlc3Npb24oY2hpbGQpIHtcbiAgICAgICAgICBpZiAoY2hpbGQuY2FsbGVlLnR5cGUgPT09ICdJbXBvcnQnKSB7XG4gICAgICAgICAgICBwcm9jZXNzRHluYW1pY0ltcG9ydChjaGlsZC5hcmd1bWVudHNbMF0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBub2RlLmJvZHkuZm9yRWFjaCgoYXN0Tm9kZSkgPT4ge1xuICAgICAgICBsZXQgcmVzb2x2ZWRQYXRoO1xuXG4gICAgICAgIC8vIHN1cHBvcnQgZm9yIGV4cG9ydCB7IHZhbHVlIH0gZnJvbSAnbW9kdWxlJ1xuICAgICAgICBpZiAoYXN0Tm9kZS50eXBlID09PSBFWFBPUlRfTkFNRURfREVDTEFSQVRJT04pIHtcbiAgICAgICAgICBpZiAoYXN0Tm9kZS5zb3VyY2UpIHtcbiAgICAgICAgICAgIHJlc29sdmVkUGF0aCA9IHJlc29sdmUoYXN0Tm9kZS5zb3VyY2UucmF3LnJlcGxhY2UoLygnfFwiKS9nLCAnJyksIGNvbnRleHQpO1xuICAgICAgICAgICAgYXN0Tm9kZS5zcGVjaWZpZXJzLmZvckVhY2goKHNwZWNpZmllcikgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBuYW1lID0gc3BlY2lmaWVyLmxvY2FsLm5hbWUgfHwgc3BlY2lmaWVyLmxvY2FsLnZhbHVlO1xuICAgICAgICAgICAgICBpZiAobmFtZSA9PT0gREVGQVVMVCkge1xuICAgICAgICAgICAgICAgIG5ld0RlZmF1bHRJbXBvcnRzLmFkZChyZXNvbHZlZFBhdGgpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG5ld0ltcG9ydHMuc2V0KG5hbWUsIHJlc29sdmVkUGF0aCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhc3ROb2RlLnR5cGUgPT09IEVYUE9SVF9BTExfREVDTEFSQVRJT04pIHtcbiAgICAgICAgICByZXNvbHZlZFBhdGggPSByZXNvbHZlKGFzdE5vZGUuc291cmNlLnJhdy5yZXBsYWNlKC8oJ3xcIikvZywgJycpLCBjb250ZXh0KTtcbiAgICAgICAgICBuZXdFeHBvcnRBbGwuYWRkKHJlc29sdmVkUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXN0Tm9kZS50eXBlID09PSBJTVBPUlRfREVDTEFSQVRJT04pIHtcbiAgICAgICAgICByZXNvbHZlZFBhdGggPSByZXNvbHZlKGFzdE5vZGUuc291cmNlLnJhdy5yZXBsYWNlKC8oJ3xcIikvZywgJycpLCBjb250ZXh0KTtcbiAgICAgICAgICBpZiAoIXJlc29sdmVkUGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChpc05vZGVNb2R1bGUocmVzb2x2ZWRQYXRoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChuZXdOYW1lc3BhY2VJbXBvcnRFeGlzdHMoYXN0Tm9kZS5zcGVjaWZpZXJzKSkge1xuICAgICAgICAgICAgbmV3TmFtZXNwYWNlSW1wb3J0cy5hZGQocmVzb2x2ZWRQYXRoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobmV3RGVmYXVsdEltcG9ydEV4aXN0cyhhc3ROb2RlLnNwZWNpZmllcnMpKSB7XG4gICAgICAgICAgICBuZXdEZWZhdWx0SW1wb3J0cy5hZGQocmVzb2x2ZWRQYXRoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBhc3ROb2RlLnNwZWNpZmllcnNcbiAgICAgICAgICAgIC5maWx0ZXIoKHNwZWNpZmllcikgPT4gc3BlY2lmaWVyLnR5cGUgIT09IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiAmJiBzcGVjaWZpZXIudHlwZSAhPT0gSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpXG4gICAgICAgICAgICAuZm9yRWFjaCgoc3BlY2lmaWVyKSA9PiB7XG4gICAgICAgICAgICAgIG5ld0ltcG9ydHMuc2V0KHNwZWNpZmllci5pbXBvcnRlZC5uYW1lIHx8IHNwZWNpZmllci5pbXBvcnRlZC52YWx1ZSwgcmVzb2x2ZWRQYXRoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgbmV3RXhwb3J0QWxsLmZvckVhY2goKHZhbHVlKSA9PiB7XG4gICAgICAgIGlmICghb2xkRXhwb3J0QWxsLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICBsZXQgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBpbXBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaW1wb3J0cyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaW1wb3J0cy5hZGQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTik7XG4gICAgICAgICAgb2xkSW1wb3J0UGF0aHMuc2V0KHZhbHVlLCBpbXBvcnRzKTtcblxuICAgICAgICAgIGxldCBleHBvcnRzID0gZXhwb3J0TGlzdC5nZXQodmFsdWUpO1xuICAgICAgICAgIGxldCBjdXJyZW50RXhwb3J0O1xuICAgICAgICAgIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQgPSBleHBvcnRzLmdldChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXhwb3J0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgIGV4cG9ydExpc3Quc2V0KHZhbHVlLCBleHBvcnRzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5hZGQoZmlsZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHdoZXJlVXNlZCA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIHdoZXJlVXNlZC5hZGQoZmlsZSk7XG4gICAgICAgICAgICBleHBvcnRzLnNldChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OLCB7IHdoZXJlVXNlZCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBvbGRFeHBvcnRBbGwuZm9yRWFjaCgodmFsdWUpID0+IHtcbiAgICAgICAgaWYgKCFuZXdFeHBvcnRBbGwuaGFzKHZhbHVlKSkge1xuICAgICAgICAgIGNvbnN0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpO1xuICAgICAgICAgIGltcG9ydHMuZGVsZXRlKEVYUE9SVF9BTExfREVDTEFSQVRJT04pO1xuXG4gICAgICAgICAgY29uc3QgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTik7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmRlbGV0ZShmaWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBuZXdEZWZhdWx0SW1wb3J0cy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuICAgICAgICBpZiAoIW9sZERlZmF1bHRJbXBvcnRzLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICBsZXQgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBpbXBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaW1wb3J0cyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaW1wb3J0cy5hZGQoSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKTtcbiAgICAgICAgICBvbGRJbXBvcnRQYXRocy5zZXQodmFsdWUsIGltcG9ydHMpO1xuXG4gICAgICAgICAgbGV0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSk7XG4gICAgICAgICAgbGV0IGN1cnJlbnRFeHBvcnQ7XG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGV4cG9ydHMgPSBuZXcgTWFwKCk7XG4gICAgICAgICAgICBleHBvcnRMaXN0LnNldCh2YWx1ZSwgZXhwb3J0cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50RXhwb3J0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuYWRkKGZpbGUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCB3aGVyZVVzZWQgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICB3aGVyZVVzZWQuYWRkKGZpbGUpO1xuICAgICAgICAgICAgZXhwb3J0cy5zZXQoSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSLCB7IHdoZXJlVXNlZCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBvbGREZWZhdWx0SW1wb3J0cy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuICAgICAgICBpZiAoIW5ld0RlZmF1bHRJbXBvcnRzLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICBjb25zdCBpbXBvcnRzID0gb2xkSW1wb3J0UGF0aHMuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBpbXBvcnRzLmRlbGV0ZShJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIpO1xuXG4gICAgICAgICAgY29uc3QgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudEV4cG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuZGVsZXRlKGZpbGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIG5ld05hbWVzcGFjZUltcG9ydHMuZm9yRWFjaCgodmFsdWUpID0+IHtcbiAgICAgICAgaWYgKCFvbGROYW1lc3BhY2VJbXBvcnRzLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICBsZXQgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBpbXBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaW1wb3J0cyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaW1wb3J0cy5hZGQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuICAgICAgICAgIG9sZEltcG9ydFBhdGhzLnNldCh2YWx1ZSwgaW1wb3J0cyk7XG5cbiAgICAgICAgICBsZXQgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBsZXQgY3VycmVudEV4cG9ydDtcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBleHBvcnRzID0gbmV3IE1hcCgpO1xuICAgICAgICAgICAgZXhwb3J0TGlzdC5zZXQodmFsdWUsIGV4cG9ydHMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudEV4cG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmFkZChmaWxlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgd2hlcmVVc2VkID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgd2hlcmVVc2VkLmFkZChmaWxlKTtcbiAgICAgICAgICAgIGV4cG9ydHMuc2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSLCB7IHdoZXJlVXNlZCB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBvbGROYW1lc3BhY2VJbXBvcnRzLmZvckVhY2goKHZhbHVlKSA9PiB7XG4gICAgICAgIGlmICghbmV3TmFtZXNwYWNlSW1wb3J0cy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgY29uc3QgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSk7XG4gICAgICAgICAgaW1wb3J0cy5kZWxldGUoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuXG4gICAgICAgICAgY29uc3QgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50RXhwb3J0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5kZWxldGUoZmlsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgbmV3SW1wb3J0cy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmICghb2xkSW1wb3J0cy5oYXMoa2V5KSkge1xuICAgICAgICAgIGxldCBpbXBvcnRzID0gb2xkSW1wb3J0UGF0aHMuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGltcG9ydHMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBpbXBvcnRzID0gbmV3IFNldCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpbXBvcnRzLmFkZChrZXkpO1xuICAgICAgICAgIG9sZEltcG9ydFBhdGhzLnNldCh2YWx1ZSwgaW1wb3J0cyk7XG5cbiAgICAgICAgICBsZXQgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBsZXQgY3VycmVudEV4cG9ydDtcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoa2V5KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXhwb3J0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgIGV4cG9ydExpc3Quc2V0KHZhbHVlLCBleHBvcnRzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5hZGQoZmlsZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHdoZXJlVXNlZCA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIHdoZXJlVXNlZC5hZGQoZmlsZSk7XG4gICAgICAgICAgICBleHBvcnRzLnNldChrZXksIHsgd2hlcmVVc2VkIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIG9sZEltcG9ydHMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAoIW5ld0ltcG9ydHMuaGFzKGtleSkpIHtcbiAgICAgICAgICBjb25zdCBpbXBvcnRzID0gb2xkSW1wb3J0UGF0aHMuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBpbXBvcnRzLmRlbGV0ZShrZXkpO1xuXG4gICAgICAgICAgY29uc3QgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoa2V5KTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudEV4cG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuZGVsZXRlKGZpbGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICAnUHJvZ3JhbTpleGl0Jyhub2RlKSB7XG4gICAgICAgIHVwZGF0ZUV4cG9ydFVzYWdlKG5vZGUpO1xuICAgICAgICB1cGRhdGVJbXBvcnRVc2FnZShub2RlKTtcbiAgICAgICAgY2hlY2tFeHBvcnRQcmVzZW5jZShub2RlKTtcbiAgICAgIH0sXG4gICAgICBFeHBvcnREZWZhdWx0RGVjbGFyYXRpb24obm9kZSkge1xuICAgICAgICBjaGVja1VzYWdlKG5vZGUsIElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUik7XG4gICAgICB9LFxuICAgICAgRXhwb3J0TmFtZWREZWNsYXJhdGlvbihub2RlKSB7XG4gICAgICAgIG5vZGUuc3BlY2lmaWVycy5mb3JFYWNoKChzcGVjaWZpZXIpID0+IHtcbiAgICAgICAgICBjaGVja1VzYWdlKG5vZGUsIHNwZWNpZmllci5leHBvcnRlZC5uYW1lIHx8IHNwZWNpZmllci5leHBvcnRlZC52YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgICBmb3JFYWNoRGVjbGFyYXRpb25JZGVudGlmaWVyKG5vZGUuZGVjbGFyYXRpb24sIChuYW1lKSA9PiB7XG4gICAgICAgICAgY2hlY2tVc2FnZShub2RlLCBuYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgIH07XG4gIH0sXG59O1xuIl19