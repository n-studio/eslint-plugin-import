'use strict';var _slicedToArray = function () {function sliceIterator(arr, i) {var _arr = [];var _n = true;var _d = false;var _e = undefined;try {for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {_arr.push(_s.value);if (i && _arr.length === i) break;}} catch (err) {_d = true;_e = err;} finally {try {if (!_n && _i["return"]) _i["return"]();} finally {if (_d) throw _e;}}return _arr;}return function (arr, i) {if (Array.isArray(arr)) {return arr;} else if (Symbol.iterator in Object(arr)) {return sliceIterator(arr, i);} else {throw new TypeError("Invalid attempt to destructure non-iterable instance");}};}();

var _minimatch = require('minimatch');var _minimatch2 = _interopRequireDefault(_minimatch);
var _arrayIncludes = require('array-includes');var _arrayIncludes2 = _interopRequireDefault(_arrayIncludes);

var _importType = require('../core/importType');var _importType2 = _interopRequireDefault(_importType);
var _staticRequire = require('../core/staticRequire');var _staticRequire2 = _interopRequireDefault(_staticRequire);
var _docsUrl = require('../docsUrl');var _docsUrl2 = _interopRequireDefault(_docsUrl);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { 'default': obj };}

var defaultGroups = ['builtin', 'external', 'parent', 'sibling', 'index'];

// REPORTING AND FIXING

function reverse(array) {
  return array.map(function (v) {
    return Object.assign({}, v, { rank: -v.rank });
  }).reverse();
}

function getTokensOrCommentsAfter(sourceCode, node, count) {
  var currentNodeOrToken = node;
  var result = [];
  for (var i = 0; i < count; i++) {
    currentNodeOrToken = sourceCode.getTokenOrCommentAfter(currentNodeOrToken);
    if (currentNodeOrToken == null) {
      break;
    }
    result.push(currentNodeOrToken);
  }
  return result;
}

function getTokensOrCommentsBefore(sourceCode, node, count) {
  var currentNodeOrToken = node;
  var result = [];
  for (var i = 0; i < count; i++) {
    currentNodeOrToken = sourceCode.getTokenOrCommentBefore(currentNodeOrToken);
    if (currentNodeOrToken == null) {
      break;
    }
    result.push(currentNodeOrToken);
  }
  return result.reverse();
}

function takeTokensAfterWhile(sourceCode, node, condition) {
  var tokens = getTokensOrCommentsAfter(sourceCode, node, 100);
  var result = [];
  for (var i = 0; i < tokens.length; i++) {
    if (condition(tokens[i])) {
      result.push(tokens[i]);
    } else {
      break;
    }
  }
  return result;
}

function takeTokensBeforeWhile(sourceCode, node, condition) {
  var tokens = getTokensOrCommentsBefore(sourceCode, node, 100);
  var result = [];
  for (var i = tokens.length - 1; i >= 0; i--) {
    if (condition(tokens[i])) {
      result.push(tokens[i]);
    } else {
      break;
    }
  }
  return result.reverse();
}

function findOutOfOrder(imported) {
  if (imported.length === 0) {
    return [];
  }
  var maxSeenRankNode = imported[0];
  return imported.filter(function (importedModule) {
    var res = importedModule.rank < maxSeenRankNode.rank;
    if (maxSeenRankNode.rank < importedModule.rank) {
      maxSeenRankNode = importedModule;
    }
    return res;
  });
}

function findRootNode(node) {
  var parent = node;
  while (parent.parent != null && parent.parent.body == null) {
    parent = parent.parent;
  }
  return parent;
}

function findEndOfLineWithComments(sourceCode, node) {
  var tokensToEndOfLine = takeTokensAfterWhile(sourceCode, node, commentOnSameLineAs(node));
  var endOfTokens = tokensToEndOfLine.length > 0 ?
  tokensToEndOfLine[tokensToEndOfLine.length - 1].range[1] :
  node.range[1];
  var result = endOfTokens;
  for (var i = endOfTokens; i < sourceCode.text.length; i++) {
    if (sourceCode.text[i] === '\n') {
      result = i + 1;
      break;
    }
    if (sourceCode.text[i] !== ' ' && sourceCode.text[i] !== '\t' && sourceCode.text[i] !== '\r') {
      break;
    }
    result = i + 1;
  }
  return result;
}

function commentOnSameLineAs(node) {
  return function (token) {return (token.type === 'Block' || token.type === 'Line') &&
    token.loc.start.line === token.loc.end.line &&
    token.loc.end.line === node.loc.end.line;};
}

function findStartOfLineWithComments(sourceCode, node) {
  var tokensToEndOfLine = takeTokensBeforeWhile(sourceCode, node, commentOnSameLineAs(node));
  var startOfTokens = tokensToEndOfLine.length > 0 ? tokensToEndOfLine[0].range[0] : node.range[0];
  var result = startOfTokens;
  for (var i = startOfTokens - 1; i > 0; i--) {
    if (sourceCode.text[i] !== ' ' && sourceCode.text[i] !== '\t') {
      break;
    }
    result = i;
  }
  return result;
}

function isRequireExpression(expr) {
  return expr != null &&
  expr.type === 'CallExpression' &&
  expr.callee != null &&
  expr.callee.name === 'require' &&
  expr.arguments != null &&
  expr.arguments.length === 1 &&
  expr.arguments[0].type === 'Literal';
}

function isSupportedRequireModule(node) {
  if (node.type !== 'VariableDeclaration') {
    return false;
  }
  if (node.declarations.length !== 1) {
    return false;
  }
  var decl = node.declarations[0];
  var isPlainRequire = decl.id && (
  decl.id.type === 'Identifier' || decl.id.type === 'ObjectPattern') &&
  isRequireExpression(decl.init);
  var isRequireWithMemberExpression = decl.id && (
  decl.id.type === 'Identifier' || decl.id.type === 'ObjectPattern') &&
  decl.init != null &&
  decl.init.type === 'CallExpression' &&
  decl.init.callee != null &&
  decl.init.callee.type === 'MemberExpression' &&
  isRequireExpression(decl.init.callee.object);
  return isPlainRequire || isRequireWithMemberExpression;
}

function isPlainImportModule(node) {
  return node.type === 'ImportDeclaration' && node.specifiers != null && node.specifiers.length > 0;
}

function isPlainImportEquals(node) {
  return node.type === 'TSImportEqualsDeclaration' && node.moduleReference.expression;
}

function canCrossNodeWhileReorder(node) {
  return isSupportedRequireModule(node) || isPlainImportModule(node) || isPlainImportEquals(node);
}

function canReorderItems(firstNode, secondNode) {
  var parent = firstNode.parent;var _sort =
  [
  parent.body.indexOf(firstNode),
  parent.body.indexOf(secondNode)].
  sort(),_sort2 = _slicedToArray(_sort, 2),firstIndex = _sort2[0],secondIndex = _sort2[1];
  var nodesBetween = parent.body.slice(firstIndex, secondIndex + 1);var _iteratorNormalCompletion = true;var _didIteratorError = false;var _iteratorError = undefined;try {
    for (var _iterator = nodesBetween[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {var nodeBetween = _step.value;
      if (!canCrossNodeWhileReorder(nodeBetween)) {
        return false;
      }
    }} catch (err) {_didIteratorError = true;_iteratorError = err;} finally {try {if (!_iteratorNormalCompletion && _iterator['return']) {_iterator['return']();}} finally {if (_didIteratorError) {throw _iteratorError;}}}
  return true;
}

function makeImportDescription(node) {
  if (node.node.importKind === 'type') {
    return 'type import';
  }
  if (node.node.importKind === 'typeof') {
    return 'typeof import';
  }
  return 'import';
}

function fixOutOfOrder(context, firstNode, secondNode, order) {
  var sourceCode = context.getSourceCode();

  var firstRoot = findRootNode(firstNode.node);
  var firstRootStart = findStartOfLineWithComments(sourceCode, firstRoot);
  var firstRootEnd = findEndOfLineWithComments(sourceCode, firstRoot);

  var secondRoot = findRootNode(secondNode.node);
  var secondRootStart = findStartOfLineWithComments(sourceCode, secondRoot);
  var secondRootEnd = findEndOfLineWithComments(sourceCode, secondRoot);
  var canFix = canReorderItems(firstRoot, secondRoot);

  var newCode = sourceCode.text.substring(secondRootStart, secondRootEnd);
  if (newCode[newCode.length - 1] !== '\n') {
    newCode = String(newCode) + '\n';
  }

  var firstImport = String(makeImportDescription(firstNode)) + ' of `' + String(firstNode.displayName) + '`';
  var secondImport = '`' + String(secondNode.displayName) + '` ' + String(makeImportDescription(secondNode));
  var message = secondImport + ' should occur ' + String(order) + ' ' + firstImport;

  if (order === 'before') {
    context.report({
      node: secondNode.node,
      message: message,
      fix: canFix && function (fixer) {return fixer.replaceTextRange(
        [firstRootStart, secondRootEnd],
        newCode + sourceCode.text.substring(firstRootStart, secondRootStart));} });


  } else if (order === 'after') {
    context.report({
      node: secondNode.node,
      message: message,
      fix: canFix && function (fixer) {return fixer.replaceTextRange(
        [secondRootStart, firstRootEnd],
        sourceCode.text.substring(secondRootEnd, firstRootEnd) + newCode);} });


  }
}

function reportOutOfOrder(context, imported, outOfOrder, order) {
  outOfOrder.forEach(function (imp) {
    var found = imported.find(function () {function hasHigherRank(importedItem) {
        return importedItem.rank > imp.rank;
      }return hasHigherRank;}());
    fixOutOfOrder(context, found, imp, order);
  });
}

function makeOutOfOrderReport(context, imported) {
  var outOfOrder = findOutOfOrder(imported);
  if (!outOfOrder.length) {
    return;
  }

  // There are things to report. Try to minimize the number of reported errors.
  var reversedImported = reverse(imported);
  var reversedOrder = findOutOfOrder(reversedImported);
  if (reversedOrder.length < outOfOrder.length) {
    reportOutOfOrder(context, reversedImported, reversedOrder, 'after');
    return;
  }
  reportOutOfOrder(context, imported, outOfOrder, 'before');
}

var compareString = function compareString(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

/** Some parsers (languages without types) don't provide ImportKind */
var DEAFULT_IMPORT_KIND = 'value';
var getNormalizedValue = function getNormalizedValue(node, toLowerCase) {
  var value = node.value;
  return toLowerCase ? String(value).toLowerCase() : value;
};

function getSorter(alphabetizeOptions) {
  var multiplier = alphabetizeOptions.order === 'asc' ? 1 : -1;
  var orderImportKind = alphabetizeOptions.orderImportKind;
  var multiplierImportKind = orderImportKind !== 'ignore' && (
  alphabetizeOptions.orderImportKind === 'asc' ? 1 : -1);

  return function () {function importsSorter(nodeA, nodeB) {
      var importA = getNormalizedValue(nodeA, alphabetizeOptions.caseInsensitive);
      var importB = getNormalizedValue(nodeB, alphabetizeOptions.caseInsensitive);
      var result = 0;

      if (!(0, _arrayIncludes2['default'])(importA, '/') && !(0, _arrayIncludes2['default'])(importB, '/')) {
        result = compareString(importA, importB);
      } else {
        var A = importA.split('/');
        var B = importB.split('/');
        var a = A.length;
        var b = B.length;

        for (var i = 0; i < Math.min(a, b); i++) {
          result = compareString(A[i], B[i]);
          if (result) {break;}
        }

        if (!result && a !== b) {
          result = a < b ? -1 : 1;
        }
      }

      result = result * multiplier;

      // In case the paths are equal (result === 0), sort them by importKind
      if (!result && multiplierImportKind) {
        result = multiplierImportKind * compareString(
        nodeA.node.importKind || DEAFULT_IMPORT_KIND,
        nodeB.node.importKind || DEAFULT_IMPORT_KIND);

      }

      return result;
    }return importsSorter;}();
}

function mutateRanksToAlphabetize(imported, alphabetizeOptions) {
  var groupedByRanks = imported.reduce(function (acc, importedItem) {
    if (!Array.isArray(acc[importedItem.rank])) {
      acc[importedItem.rank] = [];
    }
    acc[importedItem.rank].push(importedItem);
    return acc;
  }, {});

  var sorterFn = getSorter(alphabetizeOptions);

  // sort group keys so that they can be iterated on in order
  var groupRanks = Object.keys(groupedByRanks).sort(function (a, b) {
    return a - b;
  });

  // sort imports locally within their group
  groupRanks.forEach(function (groupRank) {
    groupedByRanks[groupRank].sort(sorterFn);
  });

  // assign globally unique rank to each import
  var newRank = 0;
  var alphabetizedRanks = groupRanks.reduce(function (acc, groupRank) {
    groupedByRanks[groupRank].forEach(function (importedItem) {
      acc[String(importedItem.value) + '|' + String(importedItem.node.importKind)] = parseInt(groupRank, 10) + newRank;
      newRank += 1;
    });
    return acc;
  }, {});

  // mutate the original group-rank with alphabetized-rank
  imported.forEach(function (importedItem) {
    importedItem.rank = alphabetizedRanks[String(importedItem.value) + '|' + String(importedItem.node.importKind)];
  });
}

// DETECTING

function computePathRank(ranks, pathGroups, path, maxPosition) {
  for (var i = 0, l = pathGroups.length; i < l; i++) {var _pathGroups$i =
    pathGroups[i],pattern = _pathGroups$i.pattern,patternOptions = _pathGroups$i.patternOptions,group = _pathGroups$i.group,_pathGroups$i$positio = _pathGroups$i.position,position = _pathGroups$i$positio === undefined ? 1 : _pathGroups$i$positio;
    if ((0, _minimatch2['default'])(path, pattern, patternOptions || { nocomment: true })) {
      return ranks[group] + position / maxPosition;
    }
  }
}

function computeRank(context, ranks, importEntry, excludedImportTypes) {
  var impType = void 0;
  var rank = void 0;
  if (importEntry.type === 'import:object') {
    impType = 'object';
  } else if (importEntry.node.importKind === 'type' && ranks.omittedTypes.indexOf('type') === -1) {
    impType = 'type';
  } else {
    impType = (0, _importType2['default'])(importEntry.value, context);
  }
  if (!excludedImportTypes.has(impType)) {
    rank = computePathRank(ranks.groups, ranks.pathGroups, importEntry.value, ranks.maxPosition);
  }
  if (typeof rank === 'undefined') {
    rank = ranks.groups[impType];
  }
  if (importEntry.type !== 'import' && !importEntry.type.startsWith('import:')) {
    rank += 100;
  }

  return rank;
}

function registerNode(context, importEntry, ranks, imported, excludedImportTypes) {
  var rank = computeRank(context, ranks, importEntry, excludedImportTypes);
  if (rank !== -1) {
    imported.push(Object.assign({}, importEntry, { rank: rank }));
  }
}

function getRequireBlock(node) {
  var n = node;
  // Handle cases like `const baz = require('foo').bar.baz`
  // and `const foo = require('foo')()`
  while (
  n.parent.type === 'MemberExpression' && n.parent.object === n ||
  n.parent.type === 'CallExpression' && n.parent.callee === n)
  {
    n = n.parent;
  }
  if (
  n.parent.type === 'VariableDeclarator' &&
  n.parent.parent.type === 'VariableDeclaration' &&
  n.parent.parent.parent.type === 'Program')
  {
    return n.parent.parent.parent;
  }
}

var types = ['builtin', 'external', 'internal', 'unknown', 'parent', 'sibling', 'index', 'object', 'type'];

// Creates an object with type-rank pairs.
// Example: { index: 0, sibling: 1, parent: 1, external: 1, builtin: 2, internal: 2 }
// Will throw an error if it contains a type that does not exist, or has a duplicate
function convertGroupsToRanks(groups) {
  if (groups.length === 1) {
    // TODO: remove this `if` and fix the bug
    return convertGroupsToRanks(groups[0]);
  }
  var rankObject = groups.reduce(function (res, group, index) {
    [].concat(group).forEach(function (groupItem) {
      if (types.indexOf(groupItem) === -1) {
        throw new Error('Incorrect configuration of the rule: Unknown type `' + String(JSON.stringify(groupItem)) + '`');
      }
      if (res[groupItem] !== undefined) {
        throw new Error('Incorrect configuration of the rule: `' + String(groupItem) + '` is duplicated');
      }
      res[groupItem] = index * 2;
    });
    return res;
  }, {});

  var omittedTypes = types.filter(function (type) {
    return typeof rankObject[type] === 'undefined';
  });

  var ranks = omittedTypes.reduce(function (res, type) {
    res[type] = groups.length * 2;
    return res;
  }, rankObject);

  return { groups: ranks, omittedTypes: omittedTypes };
}

function convertPathGroupsForRanks(pathGroups) {
  var after = {};
  var before = {};

  var transformed = pathGroups.map(function (pathGroup, index) {var
    group = pathGroup.group,positionString = pathGroup.position;
    var position = 0;
    if (positionString === 'after') {
      if (!after[group]) {
        after[group] = 1;
      }
      position = after[group]++;
    } else if (positionString === 'before') {
      if (!before[group]) {
        before[group] = [];
      }
      before[group].push(index);
    }

    return Object.assign({}, pathGroup, { position: position });
  });

  var maxPosition = 1;

  Object.keys(before).forEach(function (group) {
    var groupLength = before[group].length;
    before[group].forEach(function (groupIndex, index) {
      transformed[groupIndex].position = -1 * (groupLength - index);
    });
    maxPosition = Math.max(maxPosition, groupLength);
  });

  Object.keys(after).forEach(function (key) {
    var groupNextPosition = after[key];
    maxPosition = Math.max(maxPosition, groupNextPosition - 1);
  });

  return {
    pathGroups: transformed,
    maxPosition: maxPosition > 10 ? Math.pow(10, Math.ceil(Math.log10(maxPosition))) : 10 };

}

function fixNewLineAfterImport(context, previousImport) {
  var prevRoot = findRootNode(previousImport.node);
  var tokensToEndOfLine = takeTokensAfterWhile(
  context.getSourceCode(), prevRoot, commentOnSameLineAs(prevRoot));

  var endOfLine = prevRoot.range[1];
  if (tokensToEndOfLine.length > 0) {
    endOfLine = tokensToEndOfLine[tokensToEndOfLine.length - 1].range[1];
  }
  return function (fixer) {return fixer.insertTextAfterRange([prevRoot.range[0], endOfLine], '\n');};
}

function removeNewLineAfterImport(context, currentImport, previousImport) {
  var sourceCode = context.getSourceCode();
  var prevRoot = findRootNode(previousImport.node);
  var currRoot = findRootNode(currentImport.node);
  var rangeToRemove = [
  findEndOfLineWithComments(sourceCode, prevRoot),
  findStartOfLineWithComments(sourceCode, currRoot)];

  if (/^\s*$/.test(sourceCode.text.substring(rangeToRemove[0], rangeToRemove[1]))) {
    return function (fixer) {return fixer.removeRange(rangeToRemove);};
  }
  return undefined;
}

function makeNewlinesBetweenReport(context, imported, newlinesBetweenImports, distinctGroup) {
  var getNumberOfEmptyLinesBetween = function getNumberOfEmptyLinesBetween(currentImport, previousImport) {
    var linesBetweenImports = context.getSourceCode().lines.slice(
    previousImport.node.loc.end.line,
    currentImport.node.loc.start.line - 1);


    return linesBetweenImports.filter(function (line) {return !line.trim().length;}).length;
  };
  var getIsStartOfDistinctGroup = function getIsStartOfDistinctGroup(currentImport, previousImport) {return currentImport.rank - 1 >= previousImport.rank;};
  var previousImport = imported[0];

  imported.slice(1).forEach(function (currentImport) {
    var emptyLinesBetween = getNumberOfEmptyLinesBetween(currentImport, previousImport);
    var isStartOfDistinctGroup = getIsStartOfDistinctGroup(currentImport, previousImport);

    if (newlinesBetweenImports === 'always' ||
    newlinesBetweenImports === 'always-and-inside-groups') {
      if (currentImport.rank !== previousImport.rank && emptyLinesBetween === 0) {
        if (distinctGroup || !distinctGroup && isStartOfDistinctGroup) {
          context.report({
            node: previousImport.node,
            message: 'There should be at least one empty line between import groups',
            fix: fixNewLineAfterImport(context, previousImport) });

        }
      } else if (emptyLinesBetween > 0 &&
      newlinesBetweenImports !== 'always-and-inside-groups') {
        if (distinctGroup && currentImport.rank === previousImport.rank || !distinctGroup && !isStartOfDistinctGroup) {
          context.report({
            node: previousImport.node,
            message: 'There should be no empty line within import group',
            fix: removeNewLineAfterImport(context, currentImport, previousImport) });

        }
      }
    } else if (emptyLinesBetween > 0) {
      context.report({
        node: previousImport.node,
        message: 'There should be no empty line between import groups',
        fix: removeNewLineAfterImport(context, currentImport, previousImport) });

    }

    previousImport = currentImport;
  });
}

function getAlphabetizeConfig(options) {
  var alphabetize = options.alphabetize || {};
  var order = alphabetize.order || 'ignore';
  var orderImportKind = alphabetize.orderImportKind || 'ignore';
  var caseInsensitive = alphabetize.caseInsensitive || false;

  return { order: order, orderImportKind: orderImportKind, caseInsensitive: caseInsensitive };
}

// TODO, semver-major: Change the default of "distinctGroup" from true to false
var defaultDistinctGroup = true;

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      category: 'Style guide',
      description: 'Enforce a convention in module import order.',
      url: (0, _docsUrl2['default'])('order') },


    fixable: 'code',
    schema: [
    {
      type: 'object',
      properties: {
        groups: {
          type: 'array' },

        pathGroupsExcludedImportTypes: {
          type: 'array' },

        distinctGroup: {
          type: 'boolean',
          'default': defaultDistinctGroup },

        pathGroups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string' },

              patternOptions: {
                type: 'object' },

              group: {
                type: 'string',
                'enum': types },

              position: {
                type: 'string',
                'enum': ['after', 'before'] } },


            additionalProperties: false,
            required: ['pattern', 'group'] } },


        'newlines-between': {
          'enum': [
          'ignore',
          'always',
          'always-and-inside-groups',
          'never'] },


        alphabetize: {
          type: 'object',
          properties: {
            caseInsensitive: {
              type: 'boolean',
              'default': false },

            order: {
              'enum': ['ignore', 'asc', 'desc'],
              'default': 'ignore' },

            orderImportKind: {
              'enum': ['ignore', 'asc', 'desc'],
              'default': 'ignore' } },


          additionalProperties: false },

        warnOnUnassignedImports: {
          type: 'boolean',
          'default': false } },


      additionalProperties: false }] },




  create: function () {function importOrderRule(context) {
      var options = context.options[0] || {};
      var newlinesBetweenImports = options['newlines-between'] || 'ignore';
      var pathGroupsExcludedImportTypes = new Set(options.pathGroupsExcludedImportTypes || ['builtin', 'external', 'object']);
      var alphabetize = getAlphabetizeConfig(options);
      var distinctGroup = options.distinctGroup == null ? defaultDistinctGroup : !!options.distinctGroup;
      var ranks = void 0;

      try {var _convertPathGroupsFor =
        convertPathGroupsForRanks(options.pathGroups || []),pathGroups = _convertPathGroupsFor.pathGroups,maxPosition = _convertPathGroupsFor.maxPosition;var _convertGroupsToRanks =
        convertGroupsToRanks(options.groups || defaultGroups),groups = _convertGroupsToRanks.groups,omittedTypes = _convertGroupsToRanks.omittedTypes;
        ranks = {
          groups: groups,
          omittedTypes: omittedTypes,
          pathGroups: pathGroups,
          maxPosition: maxPosition };

      } catch (error) {
        // Malformed configuration
        return {
          Program: function () {function Program(node) {
              context.report(node, error.message);
            }return Program;}() };

      }
      var importMap = new Map();

      function getBlockImports(node) {
        if (!importMap.has(node)) {
          importMap.set(node, []);
        }
        return importMap.get(node);
      }

      return {
        ImportDeclaration: function () {function handleImports(node) {
            // Ignoring unassigned imports unless warnOnUnassignedImports is set
            if (node.specifiers.length || options.warnOnUnassignedImports) {
              var name = node.source.value;
              registerNode(
              context,
              {
                node: node,
                value: name,
                displayName: name,
                type: 'import' },

              ranks,
              getBlockImports(node.parent),
              pathGroupsExcludedImportTypes);

            }
          }return handleImports;}(),
        TSImportEqualsDeclaration: function () {function handleImports(node) {
            var displayName = void 0;
            var value = void 0;
            var type = void 0;
            // skip "export import"s
            if (node.isExport) {
              return;
            }
            if (node.moduleReference.type === 'TSExternalModuleReference') {
              value = node.moduleReference.expression.value;
              displayName = value;
              type = 'import';
            } else {
              value = '';
              displayName = context.getSourceCode().getText(node.moduleReference);
              type = 'import:object';
            }
            registerNode(
            context,
            {
              node: node,
              value: value,
              displayName: displayName,
              type: type },

            ranks,
            getBlockImports(node.parent),
            pathGroupsExcludedImportTypes);

          }return handleImports;}(),
        CallExpression: function () {function handleRequires(node) {
            if (!(0, _staticRequire2['default'])(node)) {
              return;
            }
            var block = getRequireBlock(node);
            if (!block) {
              return;
            }
            var name = node.arguments[0].value;
            registerNode(
            context,
            {
              node: node,
              value: name,
              displayName: name,
              type: 'require' },

            ranks,
            getBlockImports(block),
            pathGroupsExcludedImportTypes);

          }return handleRequires;}(),
        'Program:exit': function () {function reportAndReset() {
            importMap.forEach(function (imported) {
              if (newlinesBetweenImports !== 'ignore') {
                makeNewlinesBetweenReport(context, imported, newlinesBetweenImports, distinctGroup);
              }

              if (alphabetize.order !== 'ignore') {
                mutateRanksToAlphabetize(imported, alphabetize);
              }

              makeOutOfOrderReport(context, imported);
            });

            importMap.clear();
          }return reportAndReset;}() };

    }return importOrderRule;}() };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9vcmRlci5qcyJdLCJuYW1lcyI6WyJkZWZhdWx0R3JvdXBzIiwicmV2ZXJzZSIsImFycmF5IiwibWFwIiwidiIsInJhbmsiLCJnZXRUb2tlbnNPckNvbW1lbnRzQWZ0ZXIiLCJzb3VyY2VDb2RlIiwibm9kZSIsImNvdW50IiwiY3VycmVudE5vZGVPclRva2VuIiwicmVzdWx0IiwiaSIsImdldFRva2VuT3JDb21tZW50QWZ0ZXIiLCJwdXNoIiwiZ2V0VG9rZW5zT3JDb21tZW50c0JlZm9yZSIsImdldFRva2VuT3JDb21tZW50QmVmb3JlIiwidGFrZVRva2Vuc0FmdGVyV2hpbGUiLCJjb25kaXRpb24iLCJ0b2tlbnMiLCJsZW5ndGgiLCJ0YWtlVG9rZW5zQmVmb3JlV2hpbGUiLCJmaW5kT3V0T2ZPcmRlciIsImltcG9ydGVkIiwibWF4U2VlblJhbmtOb2RlIiwiZmlsdGVyIiwiaW1wb3J0ZWRNb2R1bGUiLCJyZXMiLCJmaW5kUm9vdE5vZGUiLCJwYXJlbnQiLCJib2R5IiwiZmluZEVuZE9mTGluZVdpdGhDb21tZW50cyIsInRva2Vuc1RvRW5kT2ZMaW5lIiwiY29tbWVudE9uU2FtZUxpbmVBcyIsImVuZE9mVG9rZW5zIiwicmFuZ2UiLCJ0ZXh0IiwidG9rZW4iLCJ0eXBlIiwibG9jIiwic3RhcnQiLCJsaW5lIiwiZW5kIiwiZmluZFN0YXJ0T2ZMaW5lV2l0aENvbW1lbnRzIiwic3RhcnRPZlRva2VucyIsImlzUmVxdWlyZUV4cHJlc3Npb24iLCJleHByIiwiY2FsbGVlIiwibmFtZSIsImFyZ3VtZW50cyIsImlzU3VwcG9ydGVkUmVxdWlyZU1vZHVsZSIsImRlY2xhcmF0aW9ucyIsImRlY2wiLCJpc1BsYWluUmVxdWlyZSIsImlkIiwiaW5pdCIsImlzUmVxdWlyZVdpdGhNZW1iZXJFeHByZXNzaW9uIiwib2JqZWN0IiwiaXNQbGFpbkltcG9ydE1vZHVsZSIsInNwZWNpZmllcnMiLCJpc1BsYWluSW1wb3J0RXF1YWxzIiwibW9kdWxlUmVmZXJlbmNlIiwiZXhwcmVzc2lvbiIsImNhbkNyb3NzTm9kZVdoaWxlUmVvcmRlciIsImNhblJlb3JkZXJJdGVtcyIsImZpcnN0Tm9kZSIsInNlY29uZE5vZGUiLCJpbmRleE9mIiwic29ydCIsImZpcnN0SW5kZXgiLCJzZWNvbmRJbmRleCIsIm5vZGVzQmV0d2VlbiIsInNsaWNlIiwibm9kZUJldHdlZW4iLCJtYWtlSW1wb3J0RGVzY3JpcHRpb24iLCJpbXBvcnRLaW5kIiwiZml4T3V0T2ZPcmRlciIsImNvbnRleHQiLCJvcmRlciIsImdldFNvdXJjZUNvZGUiLCJmaXJzdFJvb3QiLCJmaXJzdFJvb3RTdGFydCIsImZpcnN0Um9vdEVuZCIsInNlY29uZFJvb3QiLCJzZWNvbmRSb290U3RhcnQiLCJzZWNvbmRSb290RW5kIiwiY2FuRml4IiwibmV3Q29kZSIsInN1YnN0cmluZyIsImZpcnN0SW1wb3J0IiwiZGlzcGxheU5hbWUiLCJzZWNvbmRJbXBvcnQiLCJtZXNzYWdlIiwicmVwb3J0IiwiZml4IiwiZml4ZXIiLCJyZXBsYWNlVGV4dFJhbmdlIiwicmVwb3J0T3V0T2ZPcmRlciIsIm91dE9mT3JkZXIiLCJmb3JFYWNoIiwiaW1wIiwiZm91bmQiLCJmaW5kIiwiaGFzSGlnaGVyUmFuayIsImltcG9ydGVkSXRlbSIsIm1ha2VPdXRPZk9yZGVyUmVwb3J0IiwicmV2ZXJzZWRJbXBvcnRlZCIsInJldmVyc2VkT3JkZXIiLCJjb21wYXJlU3RyaW5nIiwiYSIsImIiLCJERUFGVUxUX0lNUE9SVF9LSU5EIiwiZ2V0Tm9ybWFsaXplZFZhbHVlIiwidG9Mb3dlckNhc2UiLCJ2YWx1ZSIsIlN0cmluZyIsImdldFNvcnRlciIsImFscGhhYmV0aXplT3B0aW9ucyIsIm11bHRpcGxpZXIiLCJvcmRlckltcG9ydEtpbmQiLCJtdWx0aXBsaWVySW1wb3J0S2luZCIsImltcG9ydHNTb3J0ZXIiLCJub2RlQSIsIm5vZGVCIiwiaW1wb3J0QSIsImNhc2VJbnNlbnNpdGl2ZSIsImltcG9ydEIiLCJBIiwic3BsaXQiLCJCIiwiTWF0aCIsIm1pbiIsIm11dGF0ZVJhbmtzVG9BbHBoYWJldGl6ZSIsImdyb3VwZWRCeVJhbmtzIiwicmVkdWNlIiwiYWNjIiwiQXJyYXkiLCJpc0FycmF5Iiwic29ydGVyRm4iLCJncm91cFJhbmtzIiwiT2JqZWN0Iiwia2V5cyIsImdyb3VwUmFuayIsIm5ld1JhbmsiLCJhbHBoYWJldGl6ZWRSYW5rcyIsInBhcnNlSW50IiwiY29tcHV0ZVBhdGhSYW5rIiwicmFua3MiLCJwYXRoR3JvdXBzIiwicGF0aCIsIm1heFBvc2l0aW9uIiwibCIsInBhdHRlcm4iLCJwYXR0ZXJuT3B0aW9ucyIsImdyb3VwIiwicG9zaXRpb24iLCJub2NvbW1lbnQiLCJjb21wdXRlUmFuayIsImltcG9ydEVudHJ5IiwiZXhjbHVkZWRJbXBvcnRUeXBlcyIsImltcFR5cGUiLCJvbWl0dGVkVHlwZXMiLCJoYXMiLCJncm91cHMiLCJzdGFydHNXaXRoIiwicmVnaXN0ZXJOb2RlIiwiZ2V0UmVxdWlyZUJsb2NrIiwibiIsInR5cGVzIiwiY29udmVydEdyb3Vwc1RvUmFua3MiLCJyYW5rT2JqZWN0IiwiaW5kZXgiLCJjb25jYXQiLCJncm91cEl0ZW0iLCJFcnJvciIsIkpTT04iLCJzdHJpbmdpZnkiLCJ1bmRlZmluZWQiLCJjb252ZXJ0UGF0aEdyb3Vwc0ZvclJhbmtzIiwiYWZ0ZXIiLCJiZWZvcmUiLCJ0cmFuc2Zvcm1lZCIsInBhdGhHcm91cCIsInBvc2l0aW9uU3RyaW5nIiwiZ3JvdXBMZW5ndGgiLCJncm91cEluZGV4IiwibWF4Iiwia2V5IiwiZ3JvdXBOZXh0UG9zaXRpb24iLCJwb3ciLCJjZWlsIiwibG9nMTAiLCJmaXhOZXdMaW5lQWZ0ZXJJbXBvcnQiLCJwcmV2aW91c0ltcG9ydCIsInByZXZSb290IiwiZW5kT2ZMaW5lIiwiaW5zZXJ0VGV4dEFmdGVyUmFuZ2UiLCJyZW1vdmVOZXdMaW5lQWZ0ZXJJbXBvcnQiLCJjdXJyZW50SW1wb3J0IiwiY3VyclJvb3QiLCJyYW5nZVRvUmVtb3ZlIiwidGVzdCIsInJlbW92ZVJhbmdlIiwibWFrZU5ld2xpbmVzQmV0d2VlblJlcG9ydCIsIm5ld2xpbmVzQmV0d2VlbkltcG9ydHMiLCJkaXN0aW5jdEdyb3VwIiwiZ2V0TnVtYmVyT2ZFbXB0eUxpbmVzQmV0d2VlbiIsImxpbmVzQmV0d2VlbkltcG9ydHMiLCJsaW5lcyIsInRyaW0iLCJnZXRJc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwIiwiZW1wdHlMaW5lc0JldHdlZW4iLCJpc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwIiwiZ2V0QWxwaGFiZXRpemVDb25maWciLCJvcHRpb25zIiwiYWxwaGFiZXRpemUiLCJkZWZhdWx0RGlzdGluY3RHcm91cCIsIm1vZHVsZSIsImV4cG9ydHMiLCJtZXRhIiwiZG9jcyIsImNhdGVnb3J5IiwiZGVzY3JpcHRpb24iLCJ1cmwiLCJmaXhhYmxlIiwic2NoZW1hIiwicHJvcGVydGllcyIsInBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzIiwiaXRlbXMiLCJhZGRpdGlvbmFsUHJvcGVydGllcyIsInJlcXVpcmVkIiwid2Fybk9uVW5hc3NpZ25lZEltcG9ydHMiLCJjcmVhdGUiLCJpbXBvcnRPcmRlclJ1bGUiLCJTZXQiLCJlcnJvciIsIlByb2dyYW0iLCJpbXBvcnRNYXAiLCJNYXAiLCJnZXRCbG9ja0ltcG9ydHMiLCJzZXQiLCJnZXQiLCJJbXBvcnREZWNsYXJhdGlvbiIsImhhbmRsZUltcG9ydHMiLCJzb3VyY2UiLCJUU0ltcG9ydEVxdWFsc0RlY2xhcmF0aW9uIiwiaXNFeHBvcnQiLCJnZXRUZXh0IiwiQ2FsbEV4cHJlc3Npb24iLCJoYW5kbGVSZXF1aXJlcyIsImJsb2NrIiwicmVwb3J0QW5kUmVzZXQiLCJjbGVhciJdLCJtYXBwaW5ncyI6IkFBQUEsYTs7QUFFQSxzQztBQUNBLCtDOztBQUVBLGdEO0FBQ0Esc0Q7QUFDQSxxQzs7QUFFQSxJQUFNQSxnQkFBZ0IsQ0FBQyxTQUFELEVBQVksVUFBWixFQUF3QixRQUF4QixFQUFrQyxTQUFsQyxFQUE2QyxPQUE3QyxDQUF0Qjs7QUFFQTs7QUFFQSxTQUFTQyxPQUFULENBQWlCQyxLQUFqQixFQUF3QjtBQUN0QixTQUFPQSxNQUFNQyxHQUFOLENBQVUsVUFBVUMsQ0FBVixFQUFhO0FBQzVCLDZCQUFZQSxDQUFaLElBQWVDLE1BQU0sQ0FBQ0QsRUFBRUMsSUFBeEI7QUFDRCxHQUZNLEVBRUpKLE9BRkksRUFBUDtBQUdEOztBQUVELFNBQVNLLHdCQUFULENBQWtDQyxVQUFsQyxFQUE4Q0MsSUFBOUMsRUFBb0RDLEtBQXBELEVBQTJEO0FBQ3pELE1BQUlDLHFCQUFxQkYsSUFBekI7QUFDQSxNQUFNRyxTQUFTLEVBQWY7QUFDQSxPQUFLLElBQUlDLElBQUksQ0FBYixFQUFnQkEsSUFBSUgsS0FBcEIsRUFBMkJHLEdBQTNCLEVBQWdDO0FBQzlCRix5QkFBcUJILFdBQVdNLHNCQUFYLENBQWtDSCxrQkFBbEMsQ0FBckI7QUFDQSxRQUFJQSxzQkFBc0IsSUFBMUIsRUFBZ0M7QUFDOUI7QUFDRDtBQUNEQyxXQUFPRyxJQUFQLENBQVlKLGtCQUFaO0FBQ0Q7QUFDRCxTQUFPQyxNQUFQO0FBQ0Q7O0FBRUQsU0FBU0kseUJBQVQsQ0FBbUNSLFVBQW5DLEVBQStDQyxJQUEvQyxFQUFxREMsS0FBckQsRUFBNEQ7QUFDMUQsTUFBSUMscUJBQXFCRixJQUF6QjtBQUNBLE1BQU1HLFNBQVMsRUFBZjtBQUNBLE9BQUssSUFBSUMsSUFBSSxDQUFiLEVBQWdCQSxJQUFJSCxLQUFwQixFQUEyQkcsR0FBM0IsRUFBZ0M7QUFDOUJGLHlCQUFxQkgsV0FBV1MsdUJBQVgsQ0FBbUNOLGtCQUFuQyxDQUFyQjtBQUNBLFFBQUlBLHNCQUFzQixJQUExQixFQUFnQztBQUM5QjtBQUNEO0FBQ0RDLFdBQU9HLElBQVAsQ0FBWUosa0JBQVo7QUFDRDtBQUNELFNBQU9DLE9BQU9WLE9BQVAsRUFBUDtBQUNEOztBQUVELFNBQVNnQixvQkFBVCxDQUE4QlYsVUFBOUIsRUFBMENDLElBQTFDLEVBQWdEVSxTQUFoRCxFQUEyRDtBQUN6RCxNQUFNQyxTQUFTYix5QkFBeUJDLFVBQXpCLEVBQXFDQyxJQUFyQyxFQUEyQyxHQUEzQyxDQUFmO0FBQ0EsTUFBTUcsU0FBUyxFQUFmO0FBQ0EsT0FBSyxJQUFJQyxJQUFJLENBQWIsRUFBZ0JBLElBQUlPLE9BQU9DLE1BQTNCLEVBQW1DUixHQUFuQyxFQUF3QztBQUN0QyxRQUFJTSxVQUFVQyxPQUFPUCxDQUFQLENBQVYsQ0FBSixFQUEwQjtBQUN4QkQsYUFBT0csSUFBUCxDQUFZSyxPQUFPUCxDQUFQLENBQVo7QUFDRCxLQUZELE1BRU87QUFDTDtBQUNEO0FBQ0Y7QUFDRCxTQUFPRCxNQUFQO0FBQ0Q7O0FBRUQsU0FBU1UscUJBQVQsQ0FBK0JkLFVBQS9CLEVBQTJDQyxJQUEzQyxFQUFpRFUsU0FBakQsRUFBNEQ7QUFDMUQsTUFBTUMsU0FBU0osMEJBQTBCUixVQUExQixFQUFzQ0MsSUFBdEMsRUFBNEMsR0FBNUMsQ0FBZjtBQUNBLE1BQU1HLFNBQVMsRUFBZjtBQUNBLE9BQUssSUFBSUMsSUFBSU8sT0FBT0MsTUFBUCxHQUFnQixDQUE3QixFQUFnQ1IsS0FBSyxDQUFyQyxFQUF3Q0EsR0FBeEMsRUFBNkM7QUFDM0MsUUFBSU0sVUFBVUMsT0FBT1AsQ0FBUCxDQUFWLENBQUosRUFBMEI7QUFDeEJELGFBQU9HLElBQVAsQ0FBWUssT0FBT1AsQ0FBUCxDQUFaO0FBQ0QsS0FGRCxNQUVPO0FBQ0w7QUFDRDtBQUNGO0FBQ0QsU0FBT0QsT0FBT1YsT0FBUCxFQUFQO0FBQ0Q7O0FBRUQsU0FBU3FCLGNBQVQsQ0FBd0JDLFFBQXhCLEVBQWtDO0FBQ2hDLE1BQUlBLFNBQVNILE1BQVQsS0FBb0IsQ0FBeEIsRUFBMkI7QUFDekIsV0FBTyxFQUFQO0FBQ0Q7QUFDRCxNQUFJSSxrQkFBa0JELFNBQVMsQ0FBVCxDQUF0QjtBQUNBLFNBQU9BLFNBQVNFLE1BQVQsQ0FBZ0IsVUFBVUMsY0FBVixFQUEwQjtBQUMvQyxRQUFNQyxNQUFNRCxlQUFlckIsSUFBZixHQUFzQm1CLGdCQUFnQm5CLElBQWxEO0FBQ0EsUUFBSW1CLGdCQUFnQm5CLElBQWhCLEdBQXVCcUIsZUFBZXJCLElBQTFDLEVBQWdEO0FBQzlDbUIsd0JBQWtCRSxjQUFsQjtBQUNEO0FBQ0QsV0FBT0MsR0FBUDtBQUNELEdBTk0sQ0FBUDtBQU9EOztBQUVELFNBQVNDLFlBQVQsQ0FBc0JwQixJQUF0QixFQUE0QjtBQUMxQixNQUFJcUIsU0FBU3JCLElBQWI7QUFDQSxTQUFPcUIsT0FBT0EsTUFBUCxJQUFpQixJQUFqQixJQUF5QkEsT0FBT0EsTUFBUCxDQUFjQyxJQUFkLElBQXNCLElBQXRELEVBQTREO0FBQzFERCxhQUFTQSxPQUFPQSxNQUFoQjtBQUNEO0FBQ0QsU0FBT0EsTUFBUDtBQUNEOztBQUVELFNBQVNFLHlCQUFULENBQW1DeEIsVUFBbkMsRUFBK0NDLElBQS9DLEVBQXFEO0FBQ25ELE1BQU13QixvQkFBb0JmLHFCQUFxQlYsVUFBckIsRUFBaUNDLElBQWpDLEVBQXVDeUIsb0JBQW9CekIsSUFBcEIsQ0FBdkMsQ0FBMUI7QUFDQSxNQUFNMEIsY0FBY0Ysa0JBQWtCWixNQUFsQixHQUEyQixDQUEzQjtBQUNoQlksb0JBQWtCQSxrQkFBa0JaLE1BQWxCLEdBQTJCLENBQTdDLEVBQWdEZSxLQUFoRCxDQUFzRCxDQUF0RCxDQURnQjtBQUVoQjNCLE9BQUsyQixLQUFMLENBQVcsQ0FBWCxDQUZKO0FBR0EsTUFBSXhCLFNBQVN1QixXQUFiO0FBQ0EsT0FBSyxJQUFJdEIsSUFBSXNCLFdBQWIsRUFBMEJ0QixJQUFJTCxXQUFXNkIsSUFBWCxDQUFnQmhCLE1BQTlDLEVBQXNEUixHQUF0RCxFQUEyRDtBQUN6RCxRQUFJTCxXQUFXNkIsSUFBWCxDQUFnQnhCLENBQWhCLE1BQXVCLElBQTNCLEVBQWlDO0FBQy9CRCxlQUFTQyxJQUFJLENBQWI7QUFDQTtBQUNEO0FBQ0QsUUFBSUwsV0FBVzZCLElBQVgsQ0FBZ0J4QixDQUFoQixNQUF1QixHQUF2QixJQUE4QkwsV0FBVzZCLElBQVgsQ0FBZ0J4QixDQUFoQixNQUF1QixJQUFyRCxJQUE2REwsV0FBVzZCLElBQVgsQ0FBZ0J4QixDQUFoQixNQUF1QixJQUF4RixFQUE4RjtBQUM1RjtBQUNEO0FBQ0RELGFBQVNDLElBQUksQ0FBYjtBQUNEO0FBQ0QsU0FBT0QsTUFBUDtBQUNEOztBQUVELFNBQVNzQixtQkFBVCxDQUE2QnpCLElBQTdCLEVBQW1DO0FBQ2pDLFNBQU8sVUFBQzZCLEtBQUQsVUFBVyxDQUFDQSxNQUFNQyxJQUFOLEtBQWUsT0FBZixJQUEyQkQsTUFBTUMsSUFBTixLQUFlLE1BQTNDO0FBQ1hELFVBQU1FLEdBQU4sQ0FBVUMsS0FBVixDQUFnQkMsSUFBaEIsS0FBeUJKLE1BQU1FLEdBQU4sQ0FBVUcsR0FBVixDQUFjRCxJQUQ1QjtBQUVYSixVQUFNRSxHQUFOLENBQVVHLEdBQVYsQ0FBY0QsSUFBZCxLQUF1QmpDLEtBQUsrQixHQUFMLENBQVNHLEdBQVQsQ0FBYUQsSUFGcEMsRUFBUDtBQUdEOztBQUVELFNBQVNFLDJCQUFULENBQXFDcEMsVUFBckMsRUFBaURDLElBQWpELEVBQXVEO0FBQ3JELE1BQU13QixvQkFBb0JYLHNCQUFzQmQsVUFBdEIsRUFBa0NDLElBQWxDLEVBQXdDeUIsb0JBQW9CekIsSUFBcEIsQ0FBeEMsQ0FBMUI7QUFDQSxNQUFNb0MsZ0JBQWdCWixrQkFBa0JaLE1BQWxCLEdBQTJCLENBQTNCLEdBQStCWSxrQkFBa0IsQ0FBbEIsRUFBcUJHLEtBQXJCLENBQTJCLENBQTNCLENBQS9CLEdBQStEM0IsS0FBSzJCLEtBQUwsQ0FBVyxDQUFYLENBQXJGO0FBQ0EsTUFBSXhCLFNBQVNpQyxhQUFiO0FBQ0EsT0FBSyxJQUFJaEMsSUFBSWdDLGdCQUFnQixDQUE3QixFQUFnQ2hDLElBQUksQ0FBcEMsRUFBdUNBLEdBQXZDLEVBQTRDO0FBQzFDLFFBQUlMLFdBQVc2QixJQUFYLENBQWdCeEIsQ0FBaEIsTUFBdUIsR0FBdkIsSUFBOEJMLFdBQVc2QixJQUFYLENBQWdCeEIsQ0FBaEIsTUFBdUIsSUFBekQsRUFBK0Q7QUFDN0Q7QUFDRDtBQUNERCxhQUFTQyxDQUFUO0FBQ0Q7QUFDRCxTQUFPRCxNQUFQO0FBQ0Q7O0FBRUQsU0FBU2tDLG1CQUFULENBQTZCQyxJQUE3QixFQUFtQztBQUNqQyxTQUFPQSxRQUFRLElBQVI7QUFDRkEsT0FBS1IsSUFBTCxLQUFjLGdCQURaO0FBRUZRLE9BQUtDLE1BQUwsSUFBZSxJQUZiO0FBR0ZELE9BQUtDLE1BQUwsQ0FBWUMsSUFBWixLQUFxQixTQUhuQjtBQUlGRixPQUFLRyxTQUFMLElBQWtCLElBSmhCO0FBS0ZILE9BQUtHLFNBQUwsQ0FBZTdCLE1BQWYsS0FBMEIsQ0FMeEI7QUFNRjBCLE9BQUtHLFNBQUwsQ0FBZSxDQUFmLEVBQWtCWCxJQUFsQixLQUEyQixTQU5oQztBQU9EOztBQUVELFNBQVNZLHdCQUFULENBQWtDMUMsSUFBbEMsRUFBd0M7QUFDdEMsTUFBSUEsS0FBSzhCLElBQUwsS0FBYyxxQkFBbEIsRUFBeUM7QUFDdkMsV0FBTyxLQUFQO0FBQ0Q7QUFDRCxNQUFJOUIsS0FBSzJDLFlBQUwsQ0FBa0IvQixNQUFsQixLQUE2QixDQUFqQyxFQUFvQztBQUNsQyxXQUFPLEtBQVA7QUFDRDtBQUNELE1BQU1nQyxPQUFPNUMsS0FBSzJDLFlBQUwsQ0FBa0IsQ0FBbEIsQ0FBYjtBQUNBLE1BQU1FLGlCQUFpQkQsS0FBS0UsRUFBTDtBQUNqQkYsT0FBS0UsRUFBTCxDQUFRaEIsSUFBUixLQUFpQixZQUFqQixJQUFpQ2MsS0FBS0UsRUFBTCxDQUFRaEIsSUFBUixLQUFpQixlQURqQztBQUVsQk8sc0JBQW9CTyxLQUFLRyxJQUF6QixDQUZMO0FBR0EsTUFBTUMsZ0NBQWdDSixLQUFLRSxFQUFMO0FBQ2hDRixPQUFLRSxFQUFMLENBQVFoQixJQUFSLEtBQWlCLFlBQWpCLElBQWlDYyxLQUFLRSxFQUFMLENBQVFoQixJQUFSLEtBQWlCLGVBRGxCO0FBRWpDYyxPQUFLRyxJQUFMLElBQWEsSUFGb0I7QUFHakNILE9BQUtHLElBQUwsQ0FBVWpCLElBQVYsS0FBbUIsZ0JBSGM7QUFJakNjLE9BQUtHLElBQUwsQ0FBVVIsTUFBVixJQUFvQixJQUphO0FBS2pDSyxPQUFLRyxJQUFMLENBQVVSLE1BQVYsQ0FBaUJULElBQWpCLEtBQTBCLGtCQUxPO0FBTWpDTyxzQkFBb0JPLEtBQUtHLElBQUwsQ0FBVVIsTUFBVixDQUFpQlUsTUFBckMsQ0FOTDtBQU9BLFNBQU9KLGtCQUFrQkcsNkJBQXpCO0FBQ0Q7O0FBRUQsU0FBU0UsbUJBQVQsQ0FBNkJsRCxJQUE3QixFQUFtQztBQUNqQyxTQUFPQSxLQUFLOEIsSUFBTCxLQUFjLG1CQUFkLElBQXFDOUIsS0FBS21ELFVBQUwsSUFBbUIsSUFBeEQsSUFBZ0VuRCxLQUFLbUQsVUFBTCxDQUFnQnZDLE1BQWhCLEdBQXlCLENBQWhHO0FBQ0Q7O0FBRUQsU0FBU3dDLG1CQUFULENBQTZCcEQsSUFBN0IsRUFBbUM7QUFDakMsU0FBT0EsS0FBSzhCLElBQUwsS0FBYywyQkFBZCxJQUE2QzlCLEtBQUtxRCxlQUFMLENBQXFCQyxVQUF6RTtBQUNEOztBQUVELFNBQVNDLHdCQUFULENBQWtDdkQsSUFBbEMsRUFBd0M7QUFDdEMsU0FBTzBDLHlCQUF5QjFDLElBQXpCLEtBQWtDa0Qsb0JBQW9CbEQsSUFBcEIsQ0FBbEMsSUFBK0RvRCxvQkFBb0JwRCxJQUFwQixDQUF0RTtBQUNEOztBQUVELFNBQVN3RCxlQUFULENBQXlCQyxTQUF6QixFQUFvQ0MsVUFBcEMsRUFBZ0Q7QUFDOUMsTUFBTXJDLFNBQVNvQyxVQUFVcEMsTUFBekIsQ0FEOEM7QUFFWjtBQUNoQ0EsU0FBT0MsSUFBUCxDQUFZcUMsT0FBWixDQUFvQkYsU0FBcEIsQ0FEZ0M7QUFFaENwQyxTQUFPQyxJQUFQLENBQVlxQyxPQUFaLENBQW9CRCxVQUFwQixDQUZnQztBQUdoQ0UsTUFIZ0MsRUFGWSxtQ0FFdkNDLFVBRnVDLGFBRTNCQyxXQUYyQjtBQU05QyxNQUFNQyxlQUFlMUMsT0FBT0MsSUFBUCxDQUFZMEMsS0FBWixDQUFrQkgsVUFBbEIsRUFBOEJDLGNBQWMsQ0FBNUMsQ0FBckIsQ0FOOEM7QUFPOUMseUJBQTBCQyxZQUExQiw4SEFBd0MsS0FBN0JFLFdBQTZCO0FBQ3RDLFVBQUksQ0FBQ1YseUJBQXlCVSxXQUF6QixDQUFMLEVBQTRDO0FBQzFDLGVBQU8sS0FBUDtBQUNEO0FBQ0YsS0FYNkM7QUFZOUMsU0FBTyxJQUFQO0FBQ0Q7O0FBRUQsU0FBU0MscUJBQVQsQ0FBK0JsRSxJQUEvQixFQUFxQztBQUNuQyxNQUFJQSxLQUFLQSxJQUFMLENBQVVtRSxVQUFWLEtBQXlCLE1BQTdCLEVBQXFDO0FBQ25DLFdBQU8sYUFBUDtBQUNEO0FBQ0QsTUFBSW5FLEtBQUtBLElBQUwsQ0FBVW1FLFVBQVYsS0FBeUIsUUFBN0IsRUFBdUM7QUFDckMsV0FBTyxlQUFQO0FBQ0Q7QUFDRCxTQUFPLFFBQVA7QUFDRDs7QUFFRCxTQUFTQyxhQUFULENBQXVCQyxPQUF2QixFQUFnQ1osU0FBaEMsRUFBMkNDLFVBQTNDLEVBQXVEWSxLQUF2RCxFQUE4RDtBQUM1RCxNQUFNdkUsYUFBYXNFLFFBQVFFLGFBQVIsRUFBbkI7O0FBRUEsTUFBTUMsWUFBWXBELGFBQWFxQyxVQUFVekQsSUFBdkIsQ0FBbEI7QUFDQSxNQUFNeUUsaUJBQWlCdEMsNEJBQTRCcEMsVUFBNUIsRUFBd0N5RSxTQUF4QyxDQUF2QjtBQUNBLE1BQU1FLGVBQWVuRCwwQkFBMEJ4QixVQUExQixFQUFzQ3lFLFNBQXRDLENBQXJCOztBQUVBLE1BQU1HLGFBQWF2RCxhQUFhc0MsV0FBVzFELElBQXhCLENBQW5CO0FBQ0EsTUFBTTRFLGtCQUFrQnpDLDRCQUE0QnBDLFVBQTVCLEVBQXdDNEUsVUFBeEMsQ0FBeEI7QUFDQSxNQUFNRSxnQkFBZ0J0RCwwQkFBMEJ4QixVQUExQixFQUFzQzRFLFVBQXRDLENBQXRCO0FBQ0EsTUFBTUcsU0FBU3RCLGdCQUFnQmdCLFNBQWhCLEVBQTJCRyxVQUEzQixDQUFmOztBQUVBLE1BQUlJLFVBQVVoRixXQUFXNkIsSUFBWCxDQUFnQm9ELFNBQWhCLENBQTBCSixlQUExQixFQUEyQ0MsYUFBM0MsQ0FBZDtBQUNBLE1BQUlFLFFBQVFBLFFBQVFuRSxNQUFSLEdBQWlCLENBQXpCLE1BQWdDLElBQXBDLEVBQTBDO0FBQ3hDbUUscUJBQWFBLE9BQWI7QUFDRDs7QUFFRCxNQUFNRSxxQkFBaUJmLHNCQUFzQlQsU0FBdEIsQ0FBakIscUJBQTBEQSxVQUFVeUIsV0FBcEUsT0FBTjtBQUNBLE1BQU1DLDRCQUFvQnpCLFdBQVd3QixXQUEvQixrQkFBZ0RoQixzQkFBc0JSLFVBQXRCLENBQWhELENBQU47QUFDQSxNQUFNMEIsVUFBYUQsWUFBYiw2QkFBMENiLEtBQTFDLFVBQW1EVyxXQUF6RDs7QUFFQSxNQUFJWCxVQUFVLFFBQWQsRUFBd0I7QUFDdEJELFlBQVFnQixNQUFSLENBQWU7QUFDYnJGLFlBQU0wRCxXQUFXMUQsSUFESjtBQUVib0Ysc0JBRmE7QUFHYkUsV0FBS1IsVUFBVyxVQUFDUyxLQUFELFVBQVdBLE1BQU1DLGdCQUFOO0FBQ3pCLFNBQUNmLGNBQUQsRUFBaUJJLGFBQWpCLENBRHlCO0FBRXpCRSxrQkFBVWhGLFdBQVc2QixJQUFYLENBQWdCb0QsU0FBaEIsQ0FBMEJQLGNBQTFCLEVBQTBDRyxlQUExQyxDQUZlLENBQVgsRUFISCxFQUFmOzs7QUFRRCxHQVRELE1BU08sSUFBSU4sVUFBVSxPQUFkLEVBQXVCO0FBQzVCRCxZQUFRZ0IsTUFBUixDQUFlO0FBQ2JyRixZQUFNMEQsV0FBVzFELElBREo7QUFFYm9GLHNCQUZhO0FBR2JFLFdBQUtSLFVBQVcsVUFBQ1MsS0FBRCxVQUFXQSxNQUFNQyxnQkFBTjtBQUN6QixTQUFDWixlQUFELEVBQWtCRixZQUFsQixDQUR5QjtBQUV6QjNFLG1CQUFXNkIsSUFBWCxDQUFnQm9ELFNBQWhCLENBQTBCSCxhQUExQixFQUF5Q0gsWUFBekMsSUFBeURLLE9BRmhDLENBQVgsRUFISCxFQUFmOzs7QUFRRDtBQUNGOztBQUVELFNBQVNVLGdCQUFULENBQTBCcEIsT0FBMUIsRUFBbUN0RCxRQUFuQyxFQUE2QzJFLFVBQTdDLEVBQXlEcEIsS0FBekQsRUFBZ0U7QUFDOURvQixhQUFXQyxPQUFYLENBQW1CLFVBQVVDLEdBQVYsRUFBZTtBQUNoQyxRQUFNQyxRQUFROUUsU0FBUytFLElBQVQsY0FBYyxTQUFTQyxhQUFULENBQXVCQyxZQUF2QixFQUFxQztBQUMvRCxlQUFPQSxhQUFhbkcsSUFBYixHQUFvQitGLElBQUkvRixJQUEvQjtBQUNELE9BRmEsT0FBdUJrRyxhQUF2QixLQUFkO0FBR0EzQixrQkFBY0MsT0FBZCxFQUF1QndCLEtBQXZCLEVBQThCRCxHQUE5QixFQUFtQ3RCLEtBQW5DO0FBQ0QsR0FMRDtBQU1EOztBQUVELFNBQVMyQixvQkFBVCxDQUE4QjVCLE9BQTlCLEVBQXVDdEQsUUFBdkMsRUFBaUQ7QUFDL0MsTUFBTTJFLGFBQWE1RSxlQUFlQyxRQUFmLENBQW5CO0FBQ0EsTUFBSSxDQUFDMkUsV0FBVzlFLE1BQWhCLEVBQXdCO0FBQ3RCO0FBQ0Q7O0FBRUQ7QUFDQSxNQUFNc0YsbUJBQW1CekcsUUFBUXNCLFFBQVIsQ0FBekI7QUFDQSxNQUFNb0YsZ0JBQWdCckYsZUFBZW9GLGdCQUFmLENBQXRCO0FBQ0EsTUFBSUMsY0FBY3ZGLE1BQWQsR0FBdUI4RSxXQUFXOUUsTUFBdEMsRUFBOEM7QUFDNUM2RSxxQkFBaUJwQixPQUFqQixFQUEwQjZCLGdCQUExQixFQUE0Q0MsYUFBNUMsRUFBMkQsT0FBM0Q7QUFDQTtBQUNEO0FBQ0RWLG1CQUFpQnBCLE9BQWpCLEVBQTBCdEQsUUFBMUIsRUFBb0MyRSxVQUFwQyxFQUFnRCxRQUFoRDtBQUNEOztBQUVELElBQU1VLGdCQUFnQixTQUFoQkEsYUFBZ0IsQ0FBQ0MsQ0FBRCxFQUFJQyxDQUFKLEVBQVU7QUFDOUIsTUFBSUQsSUFBSUMsQ0FBUixFQUFXO0FBQ1QsV0FBTyxDQUFDLENBQVI7QUFDRDtBQUNELE1BQUlELElBQUlDLENBQVIsRUFBVztBQUNULFdBQU8sQ0FBUDtBQUNEO0FBQ0QsU0FBTyxDQUFQO0FBQ0QsQ0FSRDs7QUFVQTtBQUNBLElBQU1DLHNCQUFzQixPQUE1QjtBQUNBLElBQU1DLHFCQUFxQixTQUFyQkEsa0JBQXFCLENBQUN4RyxJQUFELEVBQU95RyxXQUFQLEVBQXVCO0FBQ2hELE1BQU1DLFFBQVExRyxLQUFLMEcsS0FBbkI7QUFDQSxTQUFPRCxjQUFjRSxPQUFPRCxLQUFQLEVBQWNELFdBQWQsRUFBZCxHQUE0Q0MsS0FBbkQ7QUFDRCxDQUhEOztBQUtBLFNBQVNFLFNBQVQsQ0FBbUJDLGtCQUFuQixFQUF1QztBQUNyQyxNQUFNQyxhQUFhRCxtQkFBbUJ2QyxLQUFuQixLQUE2QixLQUE3QixHQUFxQyxDQUFyQyxHQUF5QyxDQUFDLENBQTdEO0FBQ0EsTUFBTXlDLGtCQUFrQkYsbUJBQW1CRSxlQUEzQztBQUNBLE1BQU1DLHVCQUF1QkQsb0JBQW9CLFFBQXBCO0FBQ3ZCRixxQkFBbUJFLGVBQW5CLEtBQXVDLEtBQXZDLEdBQStDLENBQS9DLEdBQW1ELENBQUMsQ0FEN0IsQ0FBN0I7O0FBR0Esc0JBQU8sU0FBU0UsYUFBVCxDQUF1QkMsS0FBdkIsRUFBOEJDLEtBQTlCLEVBQXFDO0FBQzFDLFVBQU1DLFVBQVVaLG1CQUFtQlUsS0FBbkIsRUFBMEJMLG1CQUFtQlEsZUFBN0MsQ0FBaEI7QUFDQSxVQUFNQyxVQUFVZCxtQkFBbUJXLEtBQW5CLEVBQTBCTixtQkFBbUJRLGVBQTdDLENBQWhCO0FBQ0EsVUFBSWxILFNBQVMsQ0FBYjs7QUFFQSxVQUFJLENBQUMsZ0NBQVNpSCxPQUFULEVBQWtCLEdBQWxCLENBQUQsSUFBMkIsQ0FBQyxnQ0FBU0UsT0FBVCxFQUFrQixHQUFsQixDQUFoQyxFQUF3RDtBQUN0RG5ILGlCQUFTaUcsY0FBY2dCLE9BQWQsRUFBdUJFLE9BQXZCLENBQVQ7QUFDRCxPQUZELE1BRU87QUFDTCxZQUFNQyxJQUFJSCxRQUFRSSxLQUFSLENBQWMsR0FBZCxDQUFWO0FBQ0EsWUFBTUMsSUFBSUgsUUFBUUUsS0FBUixDQUFjLEdBQWQsQ0FBVjtBQUNBLFlBQU1uQixJQUFJa0IsRUFBRTNHLE1BQVo7QUFDQSxZQUFNMEYsSUFBSW1CLEVBQUU3RyxNQUFaOztBQUVBLGFBQUssSUFBSVIsSUFBSSxDQUFiLEVBQWdCQSxJQUFJc0gsS0FBS0MsR0FBTCxDQUFTdEIsQ0FBVCxFQUFZQyxDQUFaLENBQXBCLEVBQW9DbEcsR0FBcEMsRUFBeUM7QUFDdkNELG1CQUFTaUcsY0FBY21CLEVBQUVuSCxDQUFGLENBQWQsRUFBb0JxSCxFQUFFckgsQ0FBRixDQUFwQixDQUFUO0FBQ0EsY0FBSUQsTUFBSixFQUFZLENBQUUsTUFBUTtBQUN2Qjs7QUFFRCxZQUFJLENBQUNBLE1BQUQsSUFBV2tHLE1BQU1DLENBQXJCLEVBQXdCO0FBQ3RCbkcsbUJBQVNrRyxJQUFJQyxDQUFKLEdBQVEsQ0FBQyxDQUFULEdBQWEsQ0FBdEI7QUFDRDtBQUNGOztBQUVEbkcsZUFBU0EsU0FBUzJHLFVBQWxCOztBQUVBO0FBQ0EsVUFBSSxDQUFDM0csTUFBRCxJQUFXNkcsb0JBQWYsRUFBcUM7QUFDbkM3RyxpQkFBUzZHLHVCQUF1Qlo7QUFDOUJjLGNBQU1sSCxJQUFOLENBQVdtRSxVQUFYLElBQXlCb0MsbUJBREs7QUFFOUJZLGNBQU1uSCxJQUFOLENBQVdtRSxVQUFYLElBQXlCb0MsbUJBRkssQ0FBaEM7O0FBSUQ7O0FBRUQsYUFBT3BHLE1BQVA7QUFDRCxLQWxDRCxPQUFnQjhHLGFBQWhCO0FBbUNEOztBQUVELFNBQVNXLHdCQUFULENBQWtDN0csUUFBbEMsRUFBNEM4RixrQkFBNUMsRUFBZ0U7QUFDOUQsTUFBTWdCLGlCQUFpQjlHLFNBQVMrRyxNQUFULENBQWdCLFVBQVVDLEdBQVYsRUFBZS9CLFlBQWYsRUFBNkI7QUFDbEUsUUFBSSxDQUFDZ0MsTUFBTUMsT0FBTixDQUFjRixJQUFJL0IsYUFBYW5HLElBQWpCLENBQWQsQ0FBTCxFQUE0QztBQUMxQ2tJLFVBQUkvQixhQUFhbkcsSUFBakIsSUFBeUIsRUFBekI7QUFDRDtBQUNEa0ksUUFBSS9CLGFBQWFuRyxJQUFqQixFQUF1QlMsSUFBdkIsQ0FBNEIwRixZQUE1QjtBQUNBLFdBQU8rQixHQUFQO0FBQ0QsR0FOc0IsRUFNcEIsRUFOb0IsQ0FBdkI7O0FBUUEsTUFBTUcsV0FBV3RCLFVBQVVDLGtCQUFWLENBQWpCOztBQUVBO0FBQ0EsTUFBTXNCLGFBQWFDLE9BQU9DLElBQVAsQ0FBWVIsY0FBWixFQUE0QmpFLElBQTVCLENBQWlDLFVBQVV5QyxDQUFWLEVBQWFDLENBQWIsRUFBZ0I7QUFDbEUsV0FBT0QsSUFBSUMsQ0FBWDtBQUNELEdBRmtCLENBQW5COztBQUlBO0FBQ0E2QixhQUFXeEMsT0FBWCxDQUFtQixVQUFVMkMsU0FBVixFQUFxQjtBQUN0Q1QsbUJBQWVTLFNBQWYsRUFBMEIxRSxJQUExQixDQUErQnNFLFFBQS9CO0FBQ0QsR0FGRDs7QUFJQTtBQUNBLE1BQUlLLFVBQVUsQ0FBZDtBQUNBLE1BQU1DLG9CQUFvQkwsV0FBV0wsTUFBWCxDQUFrQixVQUFVQyxHQUFWLEVBQWVPLFNBQWYsRUFBMEI7QUFDcEVULG1CQUFlUyxTQUFmLEVBQTBCM0MsT0FBMUIsQ0FBa0MsVUFBVUssWUFBVixFQUF3QjtBQUN4RCtCLGlCQUFPL0IsYUFBYVUsS0FBcEIsaUJBQTZCVixhQUFhaEcsSUFBYixDQUFrQm1FLFVBQS9DLEtBQStEc0UsU0FBU0gsU0FBVCxFQUFvQixFQUFwQixJQUEwQkMsT0FBekY7QUFDQUEsaUJBQVcsQ0FBWDtBQUNELEtBSEQ7QUFJQSxXQUFPUixHQUFQO0FBQ0QsR0FOeUIsRUFNdkIsRUFOdUIsQ0FBMUI7O0FBUUE7QUFDQWhILFdBQVM0RSxPQUFULENBQWlCLFVBQVVLLFlBQVYsRUFBd0I7QUFDdkNBLGlCQUFhbkcsSUFBYixHQUFvQjJJLHlCQUFxQnhDLGFBQWFVLEtBQWxDLGlCQUEyQ1YsYUFBYWhHLElBQWIsQ0FBa0JtRSxVQUE3RCxFQUFwQjtBQUNELEdBRkQ7QUFHRDs7QUFFRDs7QUFFQSxTQUFTdUUsZUFBVCxDQUF5QkMsS0FBekIsRUFBZ0NDLFVBQWhDLEVBQTRDQyxJQUE1QyxFQUFrREMsV0FBbEQsRUFBK0Q7QUFDN0QsT0FBSyxJQUFJMUksSUFBSSxDQUFSLEVBQVcySSxJQUFJSCxXQUFXaEksTUFBL0IsRUFBdUNSLElBQUkySSxDQUEzQyxFQUE4QzNJLEdBQTlDLEVBQW1EO0FBQ1F3SSxlQUFXeEksQ0FBWCxDQURSLENBQ3pDNEksT0FEeUMsaUJBQ3pDQSxPQUR5QyxDQUNoQ0MsY0FEZ0MsaUJBQ2hDQSxjQURnQyxDQUNoQkMsS0FEZ0IsaUJBQ2hCQSxLQURnQix1Q0FDVEMsUUFEUyxDQUNUQSxRQURTLHlDQUNFLENBREY7QUFFakQsUUFBSSw0QkFBVU4sSUFBVixFQUFnQkcsT0FBaEIsRUFBeUJDLGtCQUFrQixFQUFFRyxXQUFXLElBQWIsRUFBM0MsQ0FBSixFQUFxRTtBQUNuRSxhQUFPVCxNQUFNTyxLQUFOLElBQWVDLFdBQVdMLFdBQWpDO0FBQ0Q7QUFDRjtBQUNGOztBQUVELFNBQVNPLFdBQVQsQ0FBcUJoRixPQUFyQixFQUE4QnNFLEtBQTlCLEVBQXFDVyxXQUFyQyxFQUFrREMsbUJBQWxELEVBQXVFO0FBQ3JFLE1BQUlDLGdCQUFKO0FBQ0EsTUFBSTNKLGFBQUo7QUFDQSxNQUFJeUosWUFBWXhILElBQVosS0FBcUIsZUFBekIsRUFBMEM7QUFDeEMwSCxjQUFVLFFBQVY7QUFDRCxHQUZELE1BRU8sSUFBSUYsWUFBWXRKLElBQVosQ0FBaUJtRSxVQUFqQixLQUFnQyxNQUFoQyxJQUEwQ3dFLE1BQU1jLFlBQU4sQ0FBbUI5RixPQUFuQixDQUEyQixNQUEzQixNQUF1QyxDQUFDLENBQXRGLEVBQXlGO0FBQzlGNkYsY0FBVSxNQUFWO0FBQ0QsR0FGTSxNQUVBO0FBQ0xBLGNBQVUsNkJBQVdGLFlBQVk1QyxLQUF2QixFQUE4QnJDLE9BQTlCLENBQVY7QUFDRDtBQUNELE1BQUksQ0FBQ2tGLG9CQUFvQkcsR0FBcEIsQ0FBd0JGLE9BQXhCLENBQUwsRUFBdUM7QUFDckMzSixXQUFPNkksZ0JBQWdCQyxNQUFNZ0IsTUFBdEIsRUFBOEJoQixNQUFNQyxVQUFwQyxFQUFnRFUsWUFBWTVDLEtBQTVELEVBQW1FaUMsTUFBTUcsV0FBekUsQ0FBUDtBQUNEO0FBQ0QsTUFBSSxPQUFPakosSUFBUCxLQUFnQixXQUFwQixFQUFpQztBQUMvQkEsV0FBTzhJLE1BQU1nQixNQUFOLENBQWFILE9BQWIsQ0FBUDtBQUNEO0FBQ0QsTUFBSUYsWUFBWXhILElBQVosS0FBcUIsUUFBckIsSUFBaUMsQ0FBQ3dILFlBQVl4SCxJQUFaLENBQWlCOEgsVUFBakIsQ0FBNEIsU0FBNUIsQ0FBdEMsRUFBOEU7QUFDNUUvSixZQUFRLEdBQVI7QUFDRDs7QUFFRCxTQUFPQSxJQUFQO0FBQ0Q7O0FBRUQsU0FBU2dLLFlBQVQsQ0FBc0J4RixPQUF0QixFQUErQmlGLFdBQS9CLEVBQTRDWCxLQUE1QyxFQUFtRDVILFFBQW5ELEVBQTZEd0ksbUJBQTdELEVBQWtGO0FBQ2hGLE1BQU0xSixPQUFPd0osWUFBWWhGLE9BQVosRUFBcUJzRSxLQUFyQixFQUE0QlcsV0FBNUIsRUFBeUNDLG1CQUF6QyxDQUFiO0FBQ0EsTUFBSTFKLFNBQVMsQ0FBQyxDQUFkLEVBQWlCO0FBQ2ZrQixhQUFTVCxJQUFULG1CQUFtQmdKLFdBQW5CLElBQWdDekosVUFBaEM7QUFDRDtBQUNGOztBQUVELFNBQVNpSyxlQUFULENBQXlCOUosSUFBekIsRUFBK0I7QUFDN0IsTUFBSStKLElBQUkvSixJQUFSO0FBQ0E7QUFDQTtBQUNBO0FBQ0UrSixJQUFFMUksTUFBRixDQUFTUyxJQUFULEtBQWtCLGtCQUFsQixJQUF3Q2lJLEVBQUUxSSxNQUFGLENBQVM0QixNQUFULEtBQW9COEcsQ0FBNUQ7QUFDR0EsSUFBRTFJLE1BQUYsQ0FBU1MsSUFBVCxLQUFrQixnQkFBbEIsSUFBc0NpSSxFQUFFMUksTUFBRixDQUFTa0IsTUFBVCxLQUFvQndILENBRi9EO0FBR0U7QUFDQUEsUUFBSUEsRUFBRTFJLE1BQU47QUFDRDtBQUNEO0FBQ0UwSSxJQUFFMUksTUFBRixDQUFTUyxJQUFULEtBQWtCLG9CQUFsQjtBQUNHaUksSUFBRTFJLE1BQUYsQ0FBU0EsTUFBVCxDQUFnQlMsSUFBaEIsS0FBeUIscUJBRDVCO0FBRUdpSSxJQUFFMUksTUFBRixDQUFTQSxNQUFULENBQWdCQSxNQUFoQixDQUF1QlMsSUFBdkIsS0FBZ0MsU0FIckM7QUFJRTtBQUNBLFdBQU9pSSxFQUFFMUksTUFBRixDQUFTQSxNQUFULENBQWdCQSxNQUF2QjtBQUNEO0FBQ0Y7O0FBRUQsSUFBTTJJLFFBQVEsQ0FBQyxTQUFELEVBQVksVUFBWixFQUF3QixVQUF4QixFQUFvQyxTQUFwQyxFQUErQyxRQUEvQyxFQUF5RCxTQUF6RCxFQUFvRSxPQUFwRSxFQUE2RSxRQUE3RSxFQUF1RixNQUF2RixDQUFkOztBQUVBO0FBQ0E7QUFDQTtBQUNBLFNBQVNDLG9CQUFULENBQThCTixNQUE5QixFQUFzQztBQUNwQyxNQUFJQSxPQUFPL0ksTUFBUCxLQUFrQixDQUF0QixFQUF5QjtBQUN2QjtBQUNBLFdBQU9xSixxQkFBcUJOLE9BQU8sQ0FBUCxDQUFyQixDQUFQO0FBQ0Q7QUFDRCxNQUFNTyxhQUFhUCxPQUFPN0IsTUFBUCxDQUFjLFVBQVUzRyxHQUFWLEVBQWUrSCxLQUFmLEVBQXNCaUIsS0FBdEIsRUFBNkI7QUFDNUQsT0FBR0MsTUFBSCxDQUFVbEIsS0FBVixFQUFpQnZELE9BQWpCLENBQXlCLFVBQVUwRSxTQUFWLEVBQXFCO0FBQzVDLFVBQUlMLE1BQU1yRyxPQUFOLENBQWMwRyxTQUFkLE1BQTZCLENBQUMsQ0FBbEMsRUFBcUM7QUFDbkMsY0FBTSxJQUFJQyxLQUFKLGdFQUFpRUMsS0FBS0MsU0FBTCxDQUFlSCxTQUFmLENBQWpFLFFBQU47QUFDRDtBQUNELFVBQUlsSixJQUFJa0osU0FBSixNQUFtQkksU0FBdkIsRUFBa0M7QUFDaEMsY0FBTSxJQUFJSCxLQUFKLG1EQUFvREQsU0FBcEQsc0JBQU47QUFDRDtBQUNEbEosVUFBSWtKLFNBQUosSUFBaUJGLFFBQVEsQ0FBekI7QUFDRCxLQVJEO0FBU0EsV0FBT2hKLEdBQVA7QUFDRCxHQVhrQixFQVdoQixFQVhnQixDQUFuQjs7QUFhQSxNQUFNc0ksZUFBZU8sTUFBTS9JLE1BQU4sQ0FBYSxVQUFVYSxJQUFWLEVBQWdCO0FBQ2hELFdBQU8sT0FBT29JLFdBQVdwSSxJQUFYLENBQVAsS0FBNEIsV0FBbkM7QUFDRCxHQUZvQixDQUFyQjs7QUFJQSxNQUFNNkcsUUFBUWMsYUFBYTNCLE1BQWIsQ0FBb0IsVUFBVTNHLEdBQVYsRUFBZVcsSUFBZixFQUFxQjtBQUNyRFgsUUFBSVcsSUFBSixJQUFZNkgsT0FBTy9JLE1BQVAsR0FBZ0IsQ0FBNUI7QUFDQSxXQUFPTyxHQUFQO0FBQ0QsR0FIYSxFQUdYK0ksVUFIVyxDQUFkOztBQUtBLFNBQU8sRUFBRVAsUUFBUWhCLEtBQVYsRUFBaUJjLDBCQUFqQixFQUFQO0FBQ0Q7O0FBRUQsU0FBU2lCLHlCQUFULENBQW1DOUIsVUFBbkMsRUFBK0M7QUFDN0MsTUFBTStCLFFBQVEsRUFBZDtBQUNBLE1BQU1DLFNBQVMsRUFBZjs7QUFFQSxNQUFNQyxjQUFjakMsV0FBV2pKLEdBQVgsQ0FBZSxVQUFDbUwsU0FBRCxFQUFZWCxLQUFaLEVBQXNCO0FBQy9DakIsU0FEK0MsR0FDWDRCLFNBRFcsQ0FDL0M1QixLQUQrQyxDQUM5QjZCLGNBRDhCLEdBQ1hELFNBRFcsQ0FDeEMzQixRQUR3QztBQUV2RCxRQUFJQSxXQUFXLENBQWY7QUFDQSxRQUFJNEIsbUJBQW1CLE9BQXZCLEVBQWdDO0FBQzlCLFVBQUksQ0FBQ0osTUFBTXpCLEtBQU4sQ0FBTCxFQUFtQjtBQUNqQnlCLGNBQU16QixLQUFOLElBQWUsQ0FBZjtBQUNEO0FBQ0RDLGlCQUFXd0IsTUFBTXpCLEtBQU4sR0FBWDtBQUNELEtBTEQsTUFLTyxJQUFJNkIsbUJBQW1CLFFBQXZCLEVBQWlDO0FBQ3RDLFVBQUksQ0FBQ0gsT0FBTzFCLEtBQVAsQ0FBTCxFQUFvQjtBQUNsQjBCLGVBQU8xQixLQUFQLElBQWdCLEVBQWhCO0FBQ0Q7QUFDRDBCLGFBQU8xQixLQUFQLEVBQWM1SSxJQUFkLENBQW1CNkosS0FBbkI7QUFDRDs7QUFFRCw2QkFBWVcsU0FBWixJQUF1QjNCLGtCQUF2QjtBQUNELEdBaEJtQixDQUFwQjs7QUFrQkEsTUFBSUwsY0FBYyxDQUFsQjs7QUFFQVYsU0FBT0MsSUFBUCxDQUFZdUMsTUFBWixFQUFvQmpGLE9BQXBCLENBQTRCLFVBQUN1RCxLQUFELEVBQVc7QUFDckMsUUFBTThCLGNBQWNKLE9BQU8xQixLQUFQLEVBQWN0SSxNQUFsQztBQUNBZ0ssV0FBTzFCLEtBQVAsRUFBY3ZELE9BQWQsQ0FBc0IsVUFBQ3NGLFVBQUQsRUFBYWQsS0FBYixFQUF1QjtBQUMzQ1Usa0JBQVlJLFVBQVosRUFBd0I5QixRQUF4QixHQUFtQyxDQUFDLENBQUQsSUFBTTZCLGNBQWNiLEtBQXBCLENBQW5DO0FBQ0QsS0FGRDtBQUdBckIsa0JBQWNwQixLQUFLd0QsR0FBTCxDQUFTcEMsV0FBVCxFQUFzQmtDLFdBQXRCLENBQWQ7QUFDRCxHQU5EOztBQVFBNUMsU0FBT0MsSUFBUCxDQUFZc0MsS0FBWixFQUFtQmhGLE9BQW5CLENBQTJCLFVBQUN3RixHQUFELEVBQVM7QUFDbEMsUUFBTUMsb0JBQW9CVCxNQUFNUSxHQUFOLENBQTFCO0FBQ0FyQyxrQkFBY3BCLEtBQUt3RCxHQUFMLENBQVNwQyxXQUFULEVBQXNCc0Msb0JBQW9CLENBQTFDLENBQWQ7QUFDRCxHQUhEOztBQUtBLFNBQU87QUFDTHhDLGdCQUFZaUMsV0FEUDtBQUVML0IsaUJBQWFBLGNBQWMsRUFBZCxHQUFtQnBCLEtBQUsyRCxHQUFMLENBQVMsRUFBVCxFQUFhM0QsS0FBSzRELElBQUwsQ0FBVTVELEtBQUs2RCxLQUFMLENBQVd6QyxXQUFYLENBQVYsQ0FBYixDQUFuQixHQUFzRSxFQUY5RSxFQUFQOztBQUlEOztBQUVELFNBQVMwQyxxQkFBVCxDQUErQm5ILE9BQS9CLEVBQXdDb0gsY0FBeEMsRUFBd0Q7QUFDdEQsTUFBTUMsV0FBV3RLLGFBQWFxSyxlQUFlekwsSUFBNUIsQ0FBakI7QUFDQSxNQUFNd0Isb0JBQW9CZjtBQUN4QjRELFVBQVFFLGFBQVIsRUFEd0IsRUFDQ21ILFFBREQsRUFDV2pLLG9CQUFvQmlLLFFBQXBCLENBRFgsQ0FBMUI7O0FBR0EsTUFBSUMsWUFBWUQsU0FBUy9KLEtBQVQsQ0FBZSxDQUFmLENBQWhCO0FBQ0EsTUFBSUgsa0JBQWtCWixNQUFsQixHQUEyQixDQUEvQixFQUFrQztBQUNoQytLLGdCQUFZbkssa0JBQWtCQSxrQkFBa0JaLE1BQWxCLEdBQTJCLENBQTdDLEVBQWdEZSxLQUFoRCxDQUFzRCxDQUF0RCxDQUFaO0FBQ0Q7QUFDRCxTQUFPLFVBQUM0RCxLQUFELFVBQVdBLE1BQU1xRyxvQkFBTixDQUEyQixDQUFDRixTQUFTL0osS0FBVCxDQUFlLENBQWYsQ0FBRCxFQUFvQmdLLFNBQXBCLENBQTNCLEVBQTJELElBQTNELENBQVgsRUFBUDtBQUNEOztBQUVELFNBQVNFLHdCQUFULENBQWtDeEgsT0FBbEMsRUFBMkN5SCxhQUEzQyxFQUEwREwsY0FBMUQsRUFBMEU7QUFDeEUsTUFBTTFMLGFBQWFzRSxRQUFRRSxhQUFSLEVBQW5CO0FBQ0EsTUFBTW1ILFdBQVd0SyxhQUFhcUssZUFBZXpMLElBQTVCLENBQWpCO0FBQ0EsTUFBTStMLFdBQVczSyxhQUFhMEssY0FBYzlMLElBQTNCLENBQWpCO0FBQ0EsTUFBTWdNLGdCQUFnQjtBQUNwQnpLLDRCQUEwQnhCLFVBQTFCLEVBQXNDMkwsUUFBdEMsQ0FEb0I7QUFFcEJ2Siw4QkFBNEJwQyxVQUE1QixFQUF3Q2dNLFFBQXhDLENBRm9CLENBQXRCOztBQUlBLE1BQUssT0FBRCxDQUFVRSxJQUFWLENBQWVsTSxXQUFXNkIsSUFBWCxDQUFnQm9ELFNBQWhCLENBQTBCZ0gsY0FBYyxDQUFkLENBQTFCLEVBQTRDQSxjQUFjLENBQWQsQ0FBNUMsQ0FBZixDQUFKLEVBQW1GO0FBQ2pGLFdBQU8sVUFBQ3pHLEtBQUQsVUFBV0EsTUFBTTJHLFdBQU4sQ0FBa0JGLGFBQWxCLENBQVgsRUFBUDtBQUNEO0FBQ0QsU0FBT3ZCLFNBQVA7QUFDRDs7QUFFRCxTQUFTMEIseUJBQVQsQ0FBbUM5SCxPQUFuQyxFQUE0Q3RELFFBQTVDLEVBQXNEcUwsc0JBQXRELEVBQThFQyxhQUE5RSxFQUE2RjtBQUMzRixNQUFNQywrQkFBK0IsU0FBL0JBLDRCQUErQixDQUFDUixhQUFELEVBQWdCTCxjQUFoQixFQUFtQztBQUN0RSxRQUFNYyxzQkFBc0JsSSxRQUFRRSxhQUFSLEdBQXdCaUksS0FBeEIsQ0FBOEJ4SSxLQUE5QjtBQUMxQnlILG1CQUFlekwsSUFBZixDQUFvQitCLEdBQXBCLENBQXdCRyxHQUF4QixDQUE0QkQsSUFERjtBQUUxQjZKLGtCQUFjOUwsSUFBZCxDQUFtQitCLEdBQW5CLENBQXVCQyxLQUF2QixDQUE2QkMsSUFBN0IsR0FBb0MsQ0FGVixDQUE1Qjs7O0FBS0EsV0FBT3NLLG9CQUFvQnRMLE1BQXBCLENBQTJCLFVBQUNnQixJQUFELFVBQVUsQ0FBQ0EsS0FBS3dLLElBQUwsR0FBWTdMLE1BQXZCLEVBQTNCLEVBQTBEQSxNQUFqRTtBQUNELEdBUEQ7QUFRQSxNQUFNOEwsNEJBQTRCLFNBQTVCQSx5QkFBNEIsQ0FBQ1osYUFBRCxFQUFnQkwsY0FBaEIsVUFBbUNLLGNBQWNqTSxJQUFkLEdBQXFCLENBQXJCLElBQTBCNEwsZUFBZTVMLElBQTVFLEVBQWxDO0FBQ0EsTUFBSTRMLGlCQUFpQjFLLFNBQVMsQ0FBVCxDQUFyQjs7QUFFQUEsV0FBU2lELEtBQVQsQ0FBZSxDQUFmLEVBQWtCMkIsT0FBbEIsQ0FBMEIsVUFBVW1HLGFBQVYsRUFBeUI7QUFDakQsUUFBTWEsb0JBQW9CTCw2QkFBNkJSLGFBQTdCLEVBQTRDTCxjQUE1QyxDQUExQjtBQUNBLFFBQU1tQix5QkFBeUJGLDBCQUEwQlosYUFBMUIsRUFBeUNMLGNBQXpDLENBQS9COztBQUVBLFFBQUlXLDJCQUEyQixRQUEzQjtBQUNHQSwrQkFBMkIsMEJBRGxDLEVBQzhEO0FBQzVELFVBQUlOLGNBQWNqTSxJQUFkLEtBQXVCNEwsZUFBZTVMLElBQXRDLElBQThDOE0sc0JBQXNCLENBQXhFLEVBQTJFO0FBQ3pFLFlBQUlOLGlCQUFpQixDQUFDQSxhQUFELElBQWtCTyxzQkFBdkMsRUFBK0Q7QUFDN0R2SSxrQkFBUWdCLE1BQVIsQ0FBZTtBQUNickYsa0JBQU15TCxlQUFlekwsSUFEUjtBQUVib0YscUJBQVMsK0RBRkk7QUFHYkUsaUJBQUtrRyxzQkFBc0JuSCxPQUF0QixFQUErQm9ILGNBQS9CLENBSFEsRUFBZjs7QUFLRDtBQUNGLE9BUkQsTUFRTyxJQUFJa0Isb0JBQW9CLENBQXBCO0FBQ05QLGlDQUEyQiwwQkFEekIsRUFDcUQ7QUFDMUQsWUFBSUMsaUJBQWlCUCxjQUFjak0sSUFBZCxLQUF1QjRMLGVBQWU1TCxJQUF2RCxJQUErRCxDQUFDd00sYUFBRCxJQUFrQixDQUFDTyxzQkFBdEYsRUFBOEc7QUFDNUd2SSxrQkFBUWdCLE1BQVIsQ0FBZTtBQUNickYsa0JBQU15TCxlQUFlekwsSUFEUjtBQUVib0YscUJBQVMsbURBRkk7QUFHYkUsaUJBQUt1Ryx5QkFBeUJ4SCxPQUF6QixFQUFrQ3lILGFBQWxDLEVBQWlETCxjQUFqRCxDQUhRLEVBQWY7O0FBS0Q7QUFDRjtBQUNGLEtBcEJELE1Bb0JPLElBQUlrQixvQkFBb0IsQ0FBeEIsRUFBMkI7QUFDaEN0SSxjQUFRZ0IsTUFBUixDQUFlO0FBQ2JyRixjQUFNeUwsZUFBZXpMLElBRFI7QUFFYm9GLGlCQUFTLHFEQUZJO0FBR2JFLGFBQUt1Ryx5QkFBeUJ4SCxPQUF6QixFQUFrQ3lILGFBQWxDLEVBQWlETCxjQUFqRCxDQUhRLEVBQWY7O0FBS0Q7O0FBRURBLHFCQUFpQkssYUFBakI7QUFDRCxHQWpDRDtBQWtDRDs7QUFFRCxTQUFTZSxvQkFBVCxDQUE4QkMsT0FBOUIsRUFBdUM7QUFDckMsTUFBTUMsY0FBY0QsUUFBUUMsV0FBUixJQUF1QixFQUEzQztBQUNBLE1BQU16SSxRQUFReUksWUFBWXpJLEtBQVosSUFBcUIsUUFBbkM7QUFDQSxNQUFNeUMsa0JBQWtCZ0csWUFBWWhHLGVBQVosSUFBK0IsUUFBdkQ7QUFDQSxNQUFNTSxrQkFBa0IwRixZQUFZMUYsZUFBWixJQUErQixLQUF2RDs7QUFFQSxTQUFPLEVBQUUvQyxZQUFGLEVBQVN5QyxnQ0FBVCxFQUEwQk0sZ0NBQTFCLEVBQVA7QUFDRDs7QUFFRDtBQUNBLElBQU0yRix1QkFBdUIsSUFBN0I7O0FBRUFDLE9BQU9DLE9BQVAsR0FBaUI7QUFDZkMsUUFBTTtBQUNKckwsVUFBTSxZQURGO0FBRUpzTCxVQUFNO0FBQ0pDLGdCQUFVLGFBRE47QUFFSkMsbUJBQWEsOENBRlQ7QUFHSkMsV0FBSywwQkFBUSxPQUFSLENBSEQsRUFGRjs7O0FBUUpDLGFBQVMsTUFSTDtBQVNKQyxZQUFRO0FBQ047QUFDRTNMLFlBQU0sUUFEUjtBQUVFNEwsa0JBQVk7QUFDVi9ELGdCQUFRO0FBQ043SCxnQkFBTSxPQURBLEVBREU7O0FBSVY2TCx1Q0FBK0I7QUFDN0I3TCxnQkFBTSxPQUR1QixFQUpyQjs7QUFPVnVLLHVCQUFlO0FBQ2J2SyxnQkFBTSxTQURPO0FBRWIscUJBQVNrTCxvQkFGSSxFQVBMOztBQVdWcEUsb0JBQVk7QUFDVjlHLGdCQUFNLE9BREk7QUFFVjhMLGlCQUFPO0FBQ0w5TCxrQkFBTSxRQUREO0FBRUw0TCx3QkFBWTtBQUNWMUUsdUJBQVM7QUFDUGxILHNCQUFNLFFBREMsRUFEQzs7QUFJVm1ILDhCQUFnQjtBQUNkbkgsc0JBQU0sUUFEUSxFQUpOOztBQU9Wb0gscUJBQU87QUFDTHBILHNCQUFNLFFBREQ7QUFFTCx3QkFBTWtJLEtBRkQsRUFQRzs7QUFXVmIsd0JBQVU7QUFDUnJILHNCQUFNLFFBREU7QUFFUix3QkFBTSxDQUFDLE9BQUQsRUFBVSxRQUFWLENBRkUsRUFYQSxFQUZQOzs7QUFrQkwrTCxrQ0FBc0IsS0FsQmpCO0FBbUJMQyxzQkFBVSxDQUFDLFNBQUQsRUFBWSxPQUFaLENBbkJMLEVBRkcsRUFYRjs7O0FBbUNWLDRCQUFvQjtBQUNsQixrQkFBTTtBQUNKLGtCQURJO0FBRUosa0JBRkk7QUFHSixvQ0FISTtBQUlKLGlCQUpJLENBRFksRUFuQ1Y7OztBQTJDVmYscUJBQWE7QUFDWGpMLGdCQUFNLFFBREs7QUFFWDRMLHNCQUFZO0FBQ1ZyRyw2QkFBaUI7QUFDZnZGLG9CQUFNLFNBRFM7QUFFZix5QkFBUyxLQUZNLEVBRFA7O0FBS1Z3QyxtQkFBTztBQUNMLHNCQUFNLENBQUMsUUFBRCxFQUFXLEtBQVgsRUFBa0IsTUFBbEIsQ0FERDtBQUVMLHlCQUFTLFFBRkosRUFMRzs7QUFTVnlDLDZCQUFpQjtBQUNmLHNCQUFNLENBQUMsUUFBRCxFQUFXLEtBQVgsRUFBa0IsTUFBbEIsQ0FEUztBQUVmLHlCQUFTLFFBRk0sRUFUUCxFQUZEOzs7QUFnQlg4RyxnQ0FBc0IsS0FoQlgsRUEzQ0g7O0FBNkRWRSxpQ0FBeUI7QUFDdkJqTSxnQkFBTSxTQURpQjtBQUV2QixxQkFBUyxLQUZjLEVBN0RmLEVBRmQ7OztBQW9FRStMLDRCQUFzQixLQXBFeEIsRUFETSxDQVRKLEVBRFM7Ozs7O0FBb0ZmRyx1QkFBUSxTQUFTQyxlQUFULENBQXlCNUosT0FBekIsRUFBa0M7QUFDeEMsVUFBTXlJLFVBQVV6SSxRQUFReUksT0FBUixDQUFnQixDQUFoQixLQUFzQixFQUF0QztBQUNBLFVBQU1WLHlCQUF5QlUsUUFBUSxrQkFBUixLQUErQixRQUE5RDtBQUNBLFVBQU1hLGdDQUFnQyxJQUFJTyxHQUFKLENBQVFwQixRQUFRYSw2QkFBUixJQUF5QyxDQUFDLFNBQUQsRUFBWSxVQUFaLEVBQXdCLFFBQXhCLENBQWpELENBQXRDO0FBQ0EsVUFBTVosY0FBY0YscUJBQXFCQyxPQUFyQixDQUFwQjtBQUNBLFVBQU1ULGdCQUFnQlMsUUFBUVQsYUFBUixJQUF5QixJQUF6QixHQUFnQ1csb0JBQWhDLEdBQXVELENBQUMsQ0FBQ0YsUUFBUVQsYUFBdkY7QUFDQSxVQUFJMUQsY0FBSjs7QUFFQSxVQUFJO0FBQ2tDK0Isa0NBQTBCb0MsUUFBUWxFLFVBQVIsSUFBc0IsRUFBaEQsQ0FEbEMsQ0FDTUEsVUFETix5QkFDTUEsVUFETixDQUNrQkUsV0FEbEIseUJBQ2tCQSxXQURsQjtBQUUrQm1CLDZCQUFxQjZDLFFBQVFuRCxNQUFSLElBQWtCbkssYUFBdkMsQ0FGL0IsQ0FFTW1LLE1BRk4seUJBRU1BLE1BRk4sQ0FFY0YsWUFGZCx5QkFFY0EsWUFGZDtBQUdGZCxnQkFBUTtBQUNOZ0Isd0JBRE07QUFFTkYsb0NBRk07QUFHTmIsZ0NBSE07QUFJTkUsa0NBSk0sRUFBUjs7QUFNRCxPQVRELENBU0UsT0FBT3FGLEtBQVAsRUFBYztBQUNkO0FBQ0EsZUFBTztBQUNMQyxpQkFESyxnQ0FDR3BPLElBREgsRUFDUztBQUNacUUsc0JBQVFnQixNQUFSLENBQWVyRixJQUFmLEVBQXFCbU8sTUFBTS9JLE9BQTNCO0FBQ0QsYUFISSxvQkFBUDs7QUFLRDtBQUNELFVBQU1pSixZQUFZLElBQUlDLEdBQUosRUFBbEI7O0FBRUEsZUFBU0MsZUFBVCxDQUF5QnZPLElBQXpCLEVBQStCO0FBQzdCLFlBQUksQ0FBQ3FPLFVBQVUzRSxHQUFWLENBQWMxSixJQUFkLENBQUwsRUFBMEI7QUFDeEJxTyxvQkFBVUcsR0FBVixDQUFjeE8sSUFBZCxFQUFvQixFQUFwQjtBQUNEO0FBQ0QsZUFBT3FPLFVBQVVJLEdBQVYsQ0FBY3pPLElBQWQsQ0FBUDtBQUNEOztBQUVELGFBQU87QUFDTDBPLHdDQUFtQixTQUFTQyxhQUFULENBQXVCM08sSUFBdkIsRUFBNkI7QUFDOUM7QUFDQSxnQkFBSUEsS0FBS21ELFVBQUwsQ0FBZ0J2QyxNQUFoQixJQUEwQmtNLFFBQVFpQix1QkFBdEMsRUFBK0Q7QUFDN0Qsa0JBQU12TCxPQUFPeEMsS0FBSzRPLE1BQUwsQ0FBWWxJLEtBQXpCO0FBQ0FtRDtBQUNFeEYscUJBREY7QUFFRTtBQUNFckUsMEJBREY7QUFFRTBHLHVCQUFPbEUsSUFGVDtBQUdFMEMsNkJBQWExQyxJQUhmO0FBSUVWLHNCQUFNLFFBSlIsRUFGRjs7QUFRRTZHLG1CQVJGO0FBU0U0Riw4QkFBZ0J2TyxLQUFLcUIsTUFBckIsQ0FURjtBQVVFc00sMkNBVkY7O0FBWUQ7QUFDRixXQWpCRCxPQUE0QmdCLGFBQTVCLElBREs7QUFtQkxFLGdEQUEyQixTQUFTRixhQUFULENBQXVCM08sSUFBdkIsRUFBNkI7QUFDdEQsZ0JBQUlrRixvQkFBSjtBQUNBLGdCQUFJd0IsY0FBSjtBQUNBLGdCQUFJNUUsYUFBSjtBQUNBO0FBQ0EsZ0JBQUk5QixLQUFLOE8sUUFBVCxFQUFtQjtBQUNqQjtBQUNEO0FBQ0QsZ0JBQUk5TyxLQUFLcUQsZUFBTCxDQUFxQnZCLElBQXJCLEtBQThCLDJCQUFsQyxFQUErRDtBQUM3RDRFLHNCQUFRMUcsS0FBS3FELGVBQUwsQ0FBcUJDLFVBQXJCLENBQWdDb0QsS0FBeEM7QUFDQXhCLDRCQUFjd0IsS0FBZDtBQUNBNUUscUJBQU8sUUFBUDtBQUNELGFBSkQsTUFJTztBQUNMNEUsc0JBQVEsRUFBUjtBQUNBeEIsNEJBQWNiLFFBQVFFLGFBQVIsR0FBd0J3SyxPQUF4QixDQUFnQy9PLEtBQUtxRCxlQUFyQyxDQUFkO0FBQ0F2QixxQkFBTyxlQUFQO0FBQ0Q7QUFDRCtIO0FBQ0V4RixtQkFERjtBQUVFO0FBQ0VyRSx3QkFERjtBQUVFMEcsMEJBRkY7QUFHRXhCLHNDQUhGO0FBSUVwRCx3QkFKRixFQUZGOztBQVFFNkcsaUJBUkY7QUFTRTRGLDRCQUFnQnZPLEtBQUtxQixNQUFyQixDQVRGO0FBVUVzTSx5Q0FWRjs7QUFZRCxXQTdCRCxPQUFvQ2dCLGFBQXBDLElBbkJLO0FBaURMSyxxQ0FBZ0IsU0FBU0MsY0FBVCxDQUF3QmpQLElBQXhCLEVBQThCO0FBQzVDLGdCQUFJLENBQUMsZ0NBQWdCQSxJQUFoQixDQUFMLEVBQTRCO0FBQzFCO0FBQ0Q7QUFDRCxnQkFBTWtQLFFBQVFwRixnQkFBZ0I5SixJQUFoQixDQUFkO0FBQ0EsZ0JBQUksQ0FBQ2tQLEtBQUwsRUFBWTtBQUNWO0FBQ0Q7QUFDRCxnQkFBTTFNLE9BQU94QyxLQUFLeUMsU0FBTCxDQUFlLENBQWYsRUFBa0JpRSxLQUEvQjtBQUNBbUQ7QUFDRXhGLG1CQURGO0FBRUU7QUFDRXJFLHdCQURGO0FBRUUwRyxxQkFBT2xFLElBRlQ7QUFHRTBDLDJCQUFhMUMsSUFIZjtBQUlFVixvQkFBTSxTQUpSLEVBRkY7O0FBUUU2RyxpQkFSRjtBQVNFNEYsNEJBQWdCVyxLQUFoQixDQVRGO0FBVUV2Qix5Q0FWRjs7QUFZRCxXQXJCRCxPQUF5QnNCLGNBQXpCLElBakRLO0FBdUVMLHFDQUFnQixTQUFTRSxjQUFULEdBQTBCO0FBQ3hDZCxzQkFBVTFJLE9BQVYsQ0FBa0IsVUFBQzVFLFFBQUQsRUFBYztBQUM5QixrQkFBSXFMLDJCQUEyQixRQUEvQixFQUF5QztBQUN2Q0QsMENBQTBCOUgsT0FBMUIsRUFBbUN0RCxRQUFuQyxFQUE2Q3FMLHNCQUE3QyxFQUFxRUMsYUFBckU7QUFDRDs7QUFFRCxrQkFBSVUsWUFBWXpJLEtBQVosS0FBc0IsUUFBMUIsRUFBb0M7QUFDbENzRCx5Q0FBeUI3RyxRQUF6QixFQUFtQ2dNLFdBQW5DO0FBQ0Q7O0FBRUQ5RyxtQ0FBcUI1QixPQUFyQixFQUE4QnRELFFBQTlCO0FBQ0QsYUFWRDs7QUFZQXNOLHNCQUFVZSxLQUFWO0FBQ0QsV0FkRCxPQUF5QkQsY0FBekIsSUF2RUssRUFBUDs7QUF1RkQsS0F6SEQsT0FBaUJsQixlQUFqQixJQXBGZSxFQUFqQiIsImZpbGUiOiJvcmRlci5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IG1pbmltYXRjaCBmcm9tICdtaW5pbWF0Y2gnO1xuaW1wb3J0IGluY2x1ZGVzIGZyb20gJ2FycmF5LWluY2x1ZGVzJztcblxuaW1wb3J0IGltcG9ydFR5cGUgZnJvbSAnLi4vY29yZS9pbXBvcnRUeXBlJztcbmltcG9ydCBpc1N0YXRpY1JlcXVpcmUgZnJvbSAnLi4vY29yZS9zdGF0aWNSZXF1aXJlJztcbmltcG9ydCBkb2NzVXJsIGZyb20gJy4uL2RvY3NVcmwnO1xuXG5jb25zdCBkZWZhdWx0R3JvdXBzID0gWydidWlsdGluJywgJ2V4dGVybmFsJywgJ3BhcmVudCcsICdzaWJsaW5nJywgJ2luZGV4J107XG5cbi8vIFJFUE9SVElORyBBTkQgRklYSU5HXG5cbmZ1bmN0aW9uIHJldmVyc2UoYXJyYXkpIHtcbiAgcmV0dXJuIGFycmF5Lm1hcChmdW5jdGlvbiAodikge1xuICAgIHJldHVybiB7IC4uLnYsIHJhbms6IC12LnJhbmsgfTtcbiAgfSkucmV2ZXJzZSgpO1xufVxuXG5mdW5jdGlvbiBnZXRUb2tlbnNPckNvbW1lbnRzQWZ0ZXIoc291cmNlQ29kZSwgbm9kZSwgY291bnQpIHtcbiAgbGV0IGN1cnJlbnROb2RlT3JUb2tlbiA9IG5vZGU7XG4gIGNvbnN0IHJlc3VsdCA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjdXJyZW50Tm9kZU9yVG9rZW4gPSBzb3VyY2VDb2RlLmdldFRva2VuT3JDb21tZW50QWZ0ZXIoY3VycmVudE5vZGVPclRva2VuKTtcbiAgICBpZiAoY3VycmVudE5vZGVPclRva2VuID09IG51bGwpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXN1bHQucHVzaChjdXJyZW50Tm9kZU9yVG9rZW4pO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGdldFRva2Vuc09yQ29tbWVudHNCZWZvcmUoc291cmNlQ29kZSwgbm9kZSwgY291bnQpIHtcbiAgbGV0IGN1cnJlbnROb2RlT3JUb2tlbiA9IG5vZGU7XG4gIGNvbnN0IHJlc3VsdCA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjdXJyZW50Tm9kZU9yVG9rZW4gPSBzb3VyY2VDb2RlLmdldFRva2VuT3JDb21tZW50QmVmb3JlKGN1cnJlbnROb2RlT3JUb2tlbik7XG4gICAgaWYgKGN1cnJlbnROb2RlT3JUb2tlbiA9PSBudWxsKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmVzdWx0LnB1c2goY3VycmVudE5vZGVPclRva2VuKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcbn1cblxuZnVuY3Rpb24gdGFrZVRva2Vuc0FmdGVyV2hpbGUoc291cmNlQ29kZSwgbm9kZSwgY29uZGl0aW9uKSB7XG4gIGNvbnN0IHRva2VucyA9IGdldFRva2Vuc09yQ29tbWVudHNBZnRlcihzb3VyY2VDb2RlLCBub2RlLCAxMDApO1xuICBjb25zdCByZXN1bHQgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoY29uZGl0aW9uKHRva2Vuc1tpXSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRva2Vuc1tpXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiB0YWtlVG9rZW5zQmVmb3JlV2hpbGUoc291cmNlQ29kZSwgbm9kZSwgY29uZGl0aW9uKSB7XG4gIGNvbnN0IHRva2VucyA9IGdldFRva2Vuc09yQ29tbWVudHNCZWZvcmUoc291cmNlQ29kZSwgbm9kZSwgMTAwKTtcbiAgY29uc3QgcmVzdWx0ID0gW107XG4gIGZvciAobGV0IGkgPSB0b2tlbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoY29uZGl0aW9uKHRva2Vuc1tpXSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRva2Vuc1tpXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKTtcbn1cblxuZnVuY3Rpb24gZmluZE91dE9mT3JkZXIoaW1wb3J0ZWQpIHtcbiAgaWYgKGltcG9ydGVkLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBsZXQgbWF4U2VlblJhbmtOb2RlID0gaW1wb3J0ZWRbMF07XG4gIHJldHVybiBpbXBvcnRlZC5maWx0ZXIoZnVuY3Rpb24gKGltcG9ydGVkTW9kdWxlKSB7XG4gICAgY29uc3QgcmVzID0gaW1wb3J0ZWRNb2R1bGUucmFuayA8IG1heFNlZW5SYW5rTm9kZS5yYW5rO1xuICAgIGlmIChtYXhTZWVuUmFua05vZGUucmFuayA8IGltcG9ydGVkTW9kdWxlLnJhbmspIHtcbiAgICAgIG1heFNlZW5SYW5rTm9kZSA9IGltcG9ydGVkTW9kdWxlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZFJvb3ROb2RlKG5vZGUpIHtcbiAgbGV0IHBhcmVudCA9IG5vZGU7XG4gIHdoaWxlIChwYXJlbnQucGFyZW50ICE9IG51bGwgJiYgcGFyZW50LnBhcmVudC5ib2R5ID09IG51bGwpIHtcbiAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuICB9XG4gIHJldHVybiBwYXJlbnQ7XG59XG5cbmZ1bmN0aW9uIGZpbmRFbmRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgbm9kZSkge1xuICBjb25zdCB0b2tlbnNUb0VuZE9mTGluZSA9IHRha2VUb2tlbnNBZnRlcldoaWxlKHNvdXJjZUNvZGUsIG5vZGUsIGNvbW1lbnRPblNhbWVMaW5lQXMobm9kZSkpO1xuICBjb25zdCBlbmRPZlRva2VucyA9IHRva2Vuc1RvRW5kT2ZMaW5lLmxlbmd0aCA+IDBcbiAgICA/IHRva2Vuc1RvRW5kT2ZMaW5lW3Rva2Vuc1RvRW5kT2ZMaW5lLmxlbmd0aCAtIDFdLnJhbmdlWzFdXG4gICAgOiBub2RlLnJhbmdlWzFdO1xuICBsZXQgcmVzdWx0ID0gZW5kT2ZUb2tlbnM7XG4gIGZvciAobGV0IGkgPSBlbmRPZlRva2VuczsgaSA8IHNvdXJjZUNvZGUudGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChzb3VyY2VDb2RlLnRleHRbaV0gPT09ICdcXG4nKSB7XG4gICAgICByZXN1bHQgPSBpICsgMTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBpZiAoc291cmNlQ29kZS50ZXh0W2ldICE9PSAnICcgJiYgc291cmNlQ29kZS50ZXh0W2ldICE9PSAnXFx0JyAmJiBzb3VyY2VDb2RlLnRleHRbaV0gIT09ICdcXHInKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmVzdWx0ID0gaSArIDE7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY29tbWVudE9uU2FtZUxpbmVBcyhub2RlKSB7XG4gIHJldHVybiAodG9rZW4pID0+ICh0b2tlbi50eXBlID09PSAnQmxvY2snIHx8ICB0b2tlbi50eXBlID09PSAnTGluZScpXG4gICAgICAmJiB0b2tlbi5sb2Muc3RhcnQubGluZSA9PT0gdG9rZW4ubG9jLmVuZC5saW5lXG4gICAgICAmJiB0b2tlbi5sb2MuZW5kLmxpbmUgPT09IG5vZGUubG9jLmVuZC5saW5lO1xufVxuXG5mdW5jdGlvbiBmaW5kU3RhcnRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgbm9kZSkge1xuICBjb25zdCB0b2tlbnNUb0VuZE9mTGluZSA9IHRha2VUb2tlbnNCZWZvcmVXaGlsZShzb3VyY2VDb2RlLCBub2RlLCBjb21tZW50T25TYW1lTGluZUFzKG5vZGUpKTtcbiAgY29uc3Qgc3RhcnRPZlRva2VucyA9IHRva2Vuc1RvRW5kT2ZMaW5lLmxlbmd0aCA+IDAgPyB0b2tlbnNUb0VuZE9mTGluZVswXS5yYW5nZVswXSA6IG5vZGUucmFuZ2VbMF07XG4gIGxldCByZXN1bHQgPSBzdGFydE9mVG9rZW5zO1xuICBmb3IgKGxldCBpID0gc3RhcnRPZlRva2VucyAtIDE7IGkgPiAwOyBpLS0pIHtcbiAgICBpZiAoc291cmNlQ29kZS50ZXh0W2ldICE9PSAnICcgJiYgc291cmNlQ29kZS50ZXh0W2ldICE9PSAnXFx0Jykge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJlc3VsdCA9IGk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gaXNSZXF1aXJlRXhwcmVzc2lvbihleHByKSB7XG4gIHJldHVybiBleHByICE9IG51bGxcbiAgICAmJiBleHByLnR5cGUgPT09ICdDYWxsRXhwcmVzc2lvbidcbiAgICAmJiBleHByLmNhbGxlZSAhPSBudWxsXG4gICAgJiYgZXhwci5jYWxsZWUubmFtZSA9PT0gJ3JlcXVpcmUnXG4gICAgJiYgZXhwci5hcmd1bWVudHMgIT0gbnVsbFxuICAgICYmIGV4cHIuYXJndW1lbnRzLmxlbmd0aCA9PT0gMVxuICAgICYmIGV4cHIuYXJndW1lbnRzWzBdLnR5cGUgPT09ICdMaXRlcmFsJztcbn1cblxuZnVuY3Rpb24gaXNTdXBwb3J0ZWRSZXF1aXJlTW9kdWxlKG5vZGUpIHtcbiAgaWYgKG5vZGUudHlwZSAhPT0gJ1ZhcmlhYmxlRGVjbGFyYXRpb24nKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChub2RlLmRlY2xhcmF0aW9ucy5sZW5ndGggIT09IDEpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgZGVjbCA9IG5vZGUuZGVjbGFyYXRpb25zWzBdO1xuICBjb25zdCBpc1BsYWluUmVxdWlyZSA9IGRlY2wuaWRcbiAgICAmJiAoZGVjbC5pZC50eXBlID09PSAnSWRlbnRpZmllcicgfHwgZGVjbC5pZC50eXBlID09PSAnT2JqZWN0UGF0dGVybicpXG4gICAgJiYgaXNSZXF1aXJlRXhwcmVzc2lvbihkZWNsLmluaXQpO1xuICBjb25zdCBpc1JlcXVpcmVXaXRoTWVtYmVyRXhwcmVzc2lvbiA9IGRlY2wuaWRcbiAgICAmJiAoZGVjbC5pZC50eXBlID09PSAnSWRlbnRpZmllcicgfHwgZGVjbC5pZC50eXBlID09PSAnT2JqZWN0UGF0dGVybicpXG4gICAgJiYgZGVjbC5pbml0ICE9IG51bGxcbiAgICAmJiBkZWNsLmluaXQudHlwZSA9PT0gJ0NhbGxFeHByZXNzaW9uJ1xuICAgICYmIGRlY2wuaW5pdC5jYWxsZWUgIT0gbnVsbFxuICAgICYmIGRlY2wuaW5pdC5jYWxsZWUudHlwZSA9PT0gJ01lbWJlckV4cHJlc3Npb24nXG4gICAgJiYgaXNSZXF1aXJlRXhwcmVzc2lvbihkZWNsLmluaXQuY2FsbGVlLm9iamVjdCk7XG4gIHJldHVybiBpc1BsYWluUmVxdWlyZSB8fCBpc1JlcXVpcmVXaXRoTWVtYmVyRXhwcmVzc2lvbjtcbn1cblxuZnVuY3Rpb24gaXNQbGFpbkltcG9ydE1vZHVsZShub2RlKSB7XG4gIHJldHVybiBub2RlLnR5cGUgPT09ICdJbXBvcnREZWNsYXJhdGlvbicgJiYgbm9kZS5zcGVjaWZpZXJzICE9IG51bGwgJiYgbm9kZS5zcGVjaWZpZXJzLmxlbmd0aCA+IDA7XG59XG5cbmZ1bmN0aW9uIGlzUGxhaW5JbXBvcnRFcXVhbHMobm9kZSkge1xuICByZXR1cm4gbm9kZS50eXBlID09PSAnVFNJbXBvcnRFcXVhbHNEZWNsYXJhdGlvbicgJiYgbm9kZS5tb2R1bGVSZWZlcmVuY2UuZXhwcmVzc2lvbjtcbn1cblxuZnVuY3Rpb24gY2FuQ3Jvc3NOb2RlV2hpbGVSZW9yZGVyKG5vZGUpIHtcbiAgcmV0dXJuIGlzU3VwcG9ydGVkUmVxdWlyZU1vZHVsZShub2RlKSB8fCBpc1BsYWluSW1wb3J0TW9kdWxlKG5vZGUpIHx8IGlzUGxhaW5JbXBvcnRFcXVhbHMobm9kZSk7XG59XG5cbmZ1bmN0aW9uIGNhblJlb3JkZXJJdGVtcyhmaXJzdE5vZGUsIHNlY29uZE5vZGUpIHtcbiAgY29uc3QgcGFyZW50ID0gZmlyc3ROb2RlLnBhcmVudDtcbiAgY29uc3QgW2ZpcnN0SW5kZXgsIHNlY29uZEluZGV4XSA9IFtcbiAgICBwYXJlbnQuYm9keS5pbmRleE9mKGZpcnN0Tm9kZSksXG4gICAgcGFyZW50LmJvZHkuaW5kZXhPZihzZWNvbmROb2RlKSxcbiAgXS5zb3J0KCk7XG4gIGNvbnN0IG5vZGVzQmV0d2VlbiA9IHBhcmVudC5ib2R5LnNsaWNlKGZpcnN0SW5kZXgsIHNlY29uZEluZGV4ICsgMSk7XG4gIGZvciAoY29uc3Qgbm9kZUJldHdlZW4gb2Ygbm9kZXNCZXR3ZWVuKSB7XG4gICAgaWYgKCFjYW5Dcm9zc05vZGVXaGlsZVJlb3JkZXIobm9kZUJldHdlZW4pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBtYWtlSW1wb3J0RGVzY3JpcHRpb24obm9kZSkge1xuICBpZiAobm9kZS5ub2RlLmltcG9ydEtpbmQgPT09ICd0eXBlJykge1xuICAgIHJldHVybiAndHlwZSBpbXBvcnQnO1xuICB9XG4gIGlmIChub2RlLm5vZGUuaW1wb3J0S2luZCA9PT0gJ3R5cGVvZicpIHtcbiAgICByZXR1cm4gJ3R5cGVvZiBpbXBvcnQnO1xuICB9XG4gIHJldHVybiAnaW1wb3J0Jztcbn1cblxuZnVuY3Rpb24gZml4T3V0T2ZPcmRlcihjb250ZXh0LCBmaXJzdE5vZGUsIHNlY29uZE5vZGUsIG9yZGVyKSB7XG4gIGNvbnN0IHNvdXJjZUNvZGUgPSBjb250ZXh0LmdldFNvdXJjZUNvZGUoKTtcblxuICBjb25zdCBmaXJzdFJvb3QgPSBmaW5kUm9vdE5vZGUoZmlyc3ROb2RlLm5vZGUpO1xuICBjb25zdCBmaXJzdFJvb3RTdGFydCA9IGZpbmRTdGFydE9mTGluZVdpdGhDb21tZW50cyhzb3VyY2VDb2RlLCBmaXJzdFJvb3QpO1xuICBjb25zdCBmaXJzdFJvb3RFbmQgPSBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIGZpcnN0Um9vdCk7XG5cbiAgY29uc3Qgc2Vjb25kUm9vdCA9IGZpbmRSb290Tm9kZShzZWNvbmROb2RlLm5vZGUpO1xuICBjb25zdCBzZWNvbmRSb290U3RhcnQgPSBmaW5kU3RhcnRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgc2Vjb25kUm9vdCk7XG4gIGNvbnN0IHNlY29uZFJvb3RFbmQgPSBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIHNlY29uZFJvb3QpO1xuICBjb25zdCBjYW5GaXggPSBjYW5SZW9yZGVySXRlbXMoZmlyc3RSb290LCBzZWNvbmRSb290KTtcblxuICBsZXQgbmV3Q29kZSA9IHNvdXJjZUNvZGUudGV4dC5zdWJzdHJpbmcoc2Vjb25kUm9vdFN0YXJ0LCBzZWNvbmRSb290RW5kKTtcbiAgaWYgKG5ld0NvZGVbbmV3Q29kZS5sZW5ndGggLSAxXSAhPT0gJ1xcbicpIHtcbiAgICBuZXdDb2RlID0gYCR7bmV3Q29kZX1cXG5gO1xuICB9XG5cbiAgY29uc3QgZmlyc3RJbXBvcnQgPSBgJHttYWtlSW1wb3J0RGVzY3JpcHRpb24oZmlyc3ROb2RlKX0gb2YgXFxgJHtmaXJzdE5vZGUuZGlzcGxheU5hbWV9XFxgYDtcbiAgY29uc3Qgc2Vjb25kSW1wb3J0ID0gYFxcYCR7c2Vjb25kTm9kZS5kaXNwbGF5TmFtZX1cXGAgJHttYWtlSW1wb3J0RGVzY3JpcHRpb24oc2Vjb25kTm9kZSl9YDtcbiAgY29uc3QgbWVzc2FnZSA9IGAke3NlY29uZEltcG9ydH0gc2hvdWxkIG9jY3VyICR7b3JkZXJ9ICR7Zmlyc3RJbXBvcnR9YDtcblxuICBpZiAob3JkZXIgPT09ICdiZWZvcmUnKSB7XG4gICAgY29udGV4dC5yZXBvcnQoe1xuICAgICAgbm9kZTogc2Vjb25kTm9kZS5ub2RlLFxuICAgICAgbWVzc2FnZSxcbiAgICAgIGZpeDogY2FuRml4ICYmICgoZml4ZXIpID0+IGZpeGVyLnJlcGxhY2VUZXh0UmFuZ2UoXG4gICAgICAgIFtmaXJzdFJvb3RTdGFydCwgc2Vjb25kUm9vdEVuZF0sXG4gICAgICAgIG5ld0NvZGUgKyBzb3VyY2VDb2RlLnRleHQuc3Vic3RyaW5nKGZpcnN0Um9vdFN0YXJ0LCBzZWNvbmRSb290U3RhcnQpLFxuICAgICAgKSksXG4gICAgfSk7XG4gIH0gZWxzZSBpZiAob3JkZXIgPT09ICdhZnRlcicpIHtcbiAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICBub2RlOiBzZWNvbmROb2RlLm5vZGUsXG4gICAgICBtZXNzYWdlLFxuICAgICAgZml4OiBjYW5GaXggJiYgKChmaXhlcikgPT4gZml4ZXIucmVwbGFjZVRleHRSYW5nZShcbiAgICAgICAgW3NlY29uZFJvb3RTdGFydCwgZmlyc3RSb290RW5kXSxcbiAgICAgICAgc291cmNlQ29kZS50ZXh0LnN1YnN0cmluZyhzZWNvbmRSb290RW5kLCBmaXJzdFJvb3RFbmQpICsgbmV3Q29kZSxcbiAgICAgICkpLFxuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlcG9ydE91dE9mT3JkZXIoY29udGV4dCwgaW1wb3J0ZWQsIG91dE9mT3JkZXIsIG9yZGVyKSB7XG4gIG91dE9mT3JkZXIuZm9yRWFjaChmdW5jdGlvbiAoaW1wKSB7XG4gICAgY29uc3QgZm91bmQgPSBpbXBvcnRlZC5maW5kKGZ1bmN0aW9uIGhhc0hpZ2hlclJhbmsoaW1wb3J0ZWRJdGVtKSB7XG4gICAgICByZXR1cm4gaW1wb3J0ZWRJdGVtLnJhbmsgPiBpbXAucmFuaztcbiAgICB9KTtcbiAgICBmaXhPdXRPZk9yZGVyKGNvbnRleHQsIGZvdW5kLCBpbXAsIG9yZGVyKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIG1ha2VPdXRPZk9yZGVyUmVwb3J0KGNvbnRleHQsIGltcG9ydGVkKSB7XG4gIGNvbnN0IG91dE9mT3JkZXIgPSBmaW5kT3V0T2ZPcmRlcihpbXBvcnRlZCk7XG4gIGlmICghb3V0T2ZPcmRlci5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGVyZSBhcmUgdGhpbmdzIHRvIHJlcG9ydC4gVHJ5IHRvIG1pbmltaXplIHRoZSBudW1iZXIgb2YgcmVwb3J0ZWQgZXJyb3JzLlxuICBjb25zdCByZXZlcnNlZEltcG9ydGVkID0gcmV2ZXJzZShpbXBvcnRlZCk7XG4gIGNvbnN0IHJldmVyc2VkT3JkZXIgPSBmaW5kT3V0T2ZPcmRlcihyZXZlcnNlZEltcG9ydGVkKTtcbiAgaWYgKHJldmVyc2VkT3JkZXIubGVuZ3RoIDwgb3V0T2ZPcmRlci5sZW5ndGgpIHtcbiAgICByZXBvcnRPdXRPZk9yZGVyKGNvbnRleHQsIHJldmVyc2VkSW1wb3J0ZWQsIHJldmVyc2VkT3JkZXIsICdhZnRlcicpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXBvcnRPdXRPZk9yZGVyKGNvbnRleHQsIGltcG9ydGVkLCBvdXRPZk9yZGVyLCAnYmVmb3JlJyk7XG59XG5cbmNvbnN0IGNvbXBhcmVTdHJpbmcgPSAoYSwgYikgPT4ge1xuICBpZiAoYSA8IGIpIHtcbiAgICByZXR1cm4gLTE7XG4gIH1cbiAgaWYgKGEgPiBiKSB7XG4gICAgcmV0dXJuIDE7XG4gIH1cbiAgcmV0dXJuIDA7XG59O1xuXG4vKiogU29tZSBwYXJzZXJzIChsYW5ndWFnZXMgd2l0aG91dCB0eXBlcykgZG9uJ3QgcHJvdmlkZSBJbXBvcnRLaW5kICovXG5jb25zdCBERUFGVUxUX0lNUE9SVF9LSU5EID0gJ3ZhbHVlJztcbmNvbnN0IGdldE5vcm1hbGl6ZWRWYWx1ZSA9IChub2RlLCB0b0xvd2VyQ2FzZSkgPT4ge1xuICBjb25zdCB2YWx1ZSA9IG5vZGUudmFsdWU7XG4gIHJldHVybiB0b0xvd2VyQ2FzZSA/IFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKSA6IHZhbHVlO1xufTtcblxuZnVuY3Rpb24gZ2V0U29ydGVyKGFscGhhYmV0aXplT3B0aW9ucykge1xuICBjb25zdCBtdWx0aXBsaWVyID0gYWxwaGFiZXRpemVPcHRpb25zLm9yZGVyID09PSAnYXNjJyA/IDEgOiAtMTtcbiAgY29uc3Qgb3JkZXJJbXBvcnRLaW5kID0gYWxwaGFiZXRpemVPcHRpb25zLm9yZGVySW1wb3J0S2luZDtcbiAgY29uc3QgbXVsdGlwbGllckltcG9ydEtpbmQgPSBvcmRlckltcG9ydEtpbmQgIT09ICdpZ25vcmUnXG4gICAgJiYgKGFscGhhYmV0aXplT3B0aW9ucy5vcmRlckltcG9ydEtpbmQgPT09ICdhc2MnID8gMSA6IC0xKTtcblxuICByZXR1cm4gZnVuY3Rpb24gaW1wb3J0c1NvcnRlcihub2RlQSwgbm9kZUIpIHtcbiAgICBjb25zdCBpbXBvcnRBID0gZ2V0Tm9ybWFsaXplZFZhbHVlKG5vZGVBLCBhbHBoYWJldGl6ZU9wdGlvbnMuY2FzZUluc2Vuc2l0aXZlKTtcbiAgICBjb25zdCBpbXBvcnRCID0gZ2V0Tm9ybWFsaXplZFZhbHVlKG5vZGVCLCBhbHBoYWJldGl6ZU9wdGlvbnMuY2FzZUluc2Vuc2l0aXZlKTtcbiAgICBsZXQgcmVzdWx0ID0gMDtcblxuICAgIGlmICghaW5jbHVkZXMoaW1wb3J0QSwgJy8nKSAmJiAhaW5jbHVkZXMoaW1wb3J0QiwgJy8nKSkge1xuICAgICAgcmVzdWx0ID0gY29tcGFyZVN0cmluZyhpbXBvcnRBLCBpbXBvcnRCKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgQSA9IGltcG9ydEEuc3BsaXQoJy8nKTtcbiAgICAgIGNvbnN0IEIgPSBpbXBvcnRCLnNwbGl0KCcvJyk7XG4gICAgICBjb25zdCBhID0gQS5sZW5ndGg7XG4gICAgICBjb25zdCBiID0gQi5sZW5ndGg7XG5cbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oYSwgYik7IGkrKykge1xuICAgICAgICByZXN1bHQgPSBjb21wYXJlU3RyaW5nKEFbaV0sIEJbaV0pO1xuICAgICAgICBpZiAocmVzdWx0KSB7IGJyZWFrOyB9XG4gICAgICB9XG5cbiAgICAgIGlmICghcmVzdWx0ICYmIGEgIT09IGIpIHtcbiAgICAgICAgcmVzdWx0ID0gYSA8IGIgPyAtMSA6IDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmVzdWx0ID0gcmVzdWx0ICogbXVsdGlwbGllcjtcblxuICAgIC8vIEluIGNhc2UgdGhlIHBhdGhzIGFyZSBlcXVhbCAocmVzdWx0ID09PSAwKSwgc29ydCB0aGVtIGJ5IGltcG9ydEtpbmRcbiAgICBpZiAoIXJlc3VsdCAmJiBtdWx0aXBsaWVySW1wb3J0S2luZCkge1xuICAgICAgcmVzdWx0ID0gbXVsdGlwbGllckltcG9ydEtpbmQgKiBjb21wYXJlU3RyaW5nKFxuICAgICAgICBub2RlQS5ub2RlLmltcG9ydEtpbmQgfHwgREVBRlVMVF9JTVBPUlRfS0lORCxcbiAgICAgICAgbm9kZUIubm9kZS5pbXBvcnRLaW5kIHx8IERFQUZVTFRfSU1QT1JUX0tJTkQsXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG59XG5cbmZ1bmN0aW9uIG11dGF0ZVJhbmtzVG9BbHBoYWJldGl6ZShpbXBvcnRlZCwgYWxwaGFiZXRpemVPcHRpb25zKSB7XG4gIGNvbnN0IGdyb3VwZWRCeVJhbmtzID0gaW1wb3J0ZWQucmVkdWNlKGZ1bmN0aW9uIChhY2MsIGltcG9ydGVkSXRlbSkge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShhY2NbaW1wb3J0ZWRJdGVtLnJhbmtdKSkge1xuICAgICAgYWNjW2ltcG9ydGVkSXRlbS5yYW5rXSA9IFtdO1xuICAgIH1cbiAgICBhY2NbaW1wb3J0ZWRJdGVtLnJhbmtdLnB1c2goaW1wb3J0ZWRJdGVtKTtcbiAgICByZXR1cm4gYWNjO1xuICB9LCB7fSk7XG5cbiAgY29uc3Qgc29ydGVyRm4gPSBnZXRTb3J0ZXIoYWxwaGFiZXRpemVPcHRpb25zKTtcblxuICAvLyBzb3J0IGdyb3VwIGtleXMgc28gdGhhdCB0aGV5IGNhbiBiZSBpdGVyYXRlZCBvbiBpbiBvcmRlclxuICBjb25zdCBncm91cFJhbmtzID0gT2JqZWN0LmtleXMoZ3JvdXBlZEJ5UmFua3MpLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gYSAtIGI7XG4gIH0pO1xuXG4gIC8vIHNvcnQgaW1wb3J0cyBsb2NhbGx5IHdpdGhpbiB0aGVpciBncm91cFxuICBncm91cFJhbmtzLmZvckVhY2goZnVuY3Rpb24gKGdyb3VwUmFuaykge1xuICAgIGdyb3VwZWRCeVJhbmtzW2dyb3VwUmFua10uc29ydChzb3J0ZXJGbik7XG4gIH0pO1xuXG4gIC8vIGFzc2lnbiBnbG9iYWxseSB1bmlxdWUgcmFuayB0byBlYWNoIGltcG9ydFxuICBsZXQgbmV3UmFuayA9IDA7XG4gIGNvbnN0IGFscGhhYmV0aXplZFJhbmtzID0gZ3JvdXBSYW5rcy5yZWR1Y2UoZnVuY3Rpb24gKGFjYywgZ3JvdXBSYW5rKSB7XG4gICAgZ3JvdXBlZEJ5UmFua3NbZ3JvdXBSYW5rXS5mb3JFYWNoKGZ1bmN0aW9uIChpbXBvcnRlZEl0ZW0pIHtcbiAgICAgIGFjY1tgJHtpbXBvcnRlZEl0ZW0udmFsdWV9fCR7aW1wb3J0ZWRJdGVtLm5vZGUuaW1wb3J0S2luZH1gXSA9IHBhcnNlSW50KGdyb3VwUmFuaywgMTApICsgbmV3UmFuaztcbiAgICAgIG5ld1JhbmsgKz0gMTtcbiAgICB9KTtcbiAgICByZXR1cm4gYWNjO1xuICB9LCB7fSk7XG5cbiAgLy8gbXV0YXRlIHRoZSBvcmlnaW5hbCBncm91cC1yYW5rIHdpdGggYWxwaGFiZXRpemVkLXJhbmtcbiAgaW1wb3J0ZWQuZm9yRWFjaChmdW5jdGlvbiAoaW1wb3J0ZWRJdGVtKSB7XG4gICAgaW1wb3J0ZWRJdGVtLnJhbmsgPSBhbHBoYWJldGl6ZWRSYW5rc1tgJHtpbXBvcnRlZEl0ZW0udmFsdWV9fCR7aW1wb3J0ZWRJdGVtLm5vZGUuaW1wb3J0S2luZH1gXTtcbiAgfSk7XG59XG5cbi8vIERFVEVDVElOR1xuXG5mdW5jdGlvbiBjb21wdXRlUGF0aFJhbmsocmFua3MsIHBhdGhHcm91cHMsIHBhdGgsIG1heFBvc2l0aW9uKSB7XG4gIGZvciAobGV0IGkgPSAwLCBsID0gcGF0aEdyb3Vwcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBjb25zdCB7IHBhdHRlcm4sIHBhdHRlcm5PcHRpb25zLCBncm91cCwgcG9zaXRpb24gPSAxIH0gPSBwYXRoR3JvdXBzW2ldO1xuICAgIGlmIChtaW5pbWF0Y2gocGF0aCwgcGF0dGVybiwgcGF0dGVybk9wdGlvbnMgfHwgeyBub2NvbW1lbnQ6IHRydWUgfSkpIHtcbiAgICAgIHJldHVybiByYW5rc1tncm91cF0gKyBwb3NpdGlvbiAvIG1heFBvc2l0aW9uO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBjb21wdXRlUmFuayhjb250ZXh0LCByYW5rcywgaW1wb3J0RW50cnksIGV4Y2x1ZGVkSW1wb3J0VHlwZXMpIHtcbiAgbGV0IGltcFR5cGU7XG4gIGxldCByYW5rO1xuICBpZiAoaW1wb3J0RW50cnkudHlwZSA9PT0gJ2ltcG9ydDpvYmplY3QnKSB7XG4gICAgaW1wVHlwZSA9ICdvYmplY3QnO1xuICB9IGVsc2UgaWYgKGltcG9ydEVudHJ5Lm5vZGUuaW1wb3J0S2luZCA9PT0gJ3R5cGUnICYmIHJhbmtzLm9taXR0ZWRUeXBlcy5pbmRleE9mKCd0eXBlJykgPT09IC0xKSB7XG4gICAgaW1wVHlwZSA9ICd0eXBlJztcbiAgfSBlbHNlIHtcbiAgICBpbXBUeXBlID0gaW1wb3J0VHlwZShpbXBvcnRFbnRyeS52YWx1ZSwgY29udGV4dCk7XG4gIH1cbiAgaWYgKCFleGNsdWRlZEltcG9ydFR5cGVzLmhhcyhpbXBUeXBlKSkge1xuICAgIHJhbmsgPSBjb21wdXRlUGF0aFJhbmsocmFua3MuZ3JvdXBzLCByYW5rcy5wYXRoR3JvdXBzLCBpbXBvcnRFbnRyeS52YWx1ZSwgcmFua3MubWF4UG9zaXRpb24pO1xuICB9XG4gIGlmICh0eXBlb2YgcmFuayA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByYW5rID0gcmFua3MuZ3JvdXBzW2ltcFR5cGVdO1xuICB9XG4gIGlmIChpbXBvcnRFbnRyeS50eXBlICE9PSAnaW1wb3J0JyAmJiAhaW1wb3J0RW50cnkudHlwZS5zdGFydHNXaXRoKCdpbXBvcnQ6JykpIHtcbiAgICByYW5rICs9IDEwMDtcbiAgfVxuXG4gIHJldHVybiByYW5rO1xufVxuXG5mdW5jdGlvbiByZWdpc3Rlck5vZGUoY29udGV4dCwgaW1wb3J0RW50cnksIHJhbmtzLCBpbXBvcnRlZCwgZXhjbHVkZWRJbXBvcnRUeXBlcykge1xuICBjb25zdCByYW5rID0gY29tcHV0ZVJhbmsoY29udGV4dCwgcmFua3MsIGltcG9ydEVudHJ5LCBleGNsdWRlZEltcG9ydFR5cGVzKTtcbiAgaWYgKHJhbmsgIT09IC0xKSB7XG4gICAgaW1wb3J0ZWQucHVzaCh7IC4uLmltcG9ydEVudHJ5LCByYW5rIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldFJlcXVpcmVCbG9jayhub2RlKSB7XG4gIGxldCBuID0gbm9kZTtcbiAgLy8gSGFuZGxlIGNhc2VzIGxpa2UgYGNvbnN0IGJheiA9IHJlcXVpcmUoJ2ZvbycpLmJhci5iYXpgXG4gIC8vIGFuZCBgY29uc3QgZm9vID0gcmVxdWlyZSgnZm9vJykoKWBcbiAgd2hpbGUgKFxuICAgIG4ucGFyZW50LnR5cGUgPT09ICdNZW1iZXJFeHByZXNzaW9uJyAmJiBuLnBhcmVudC5vYmplY3QgPT09IG5cbiAgICB8fCBuLnBhcmVudC50eXBlID09PSAnQ2FsbEV4cHJlc3Npb24nICYmIG4ucGFyZW50LmNhbGxlZSA9PT0gblxuICApIHtcbiAgICBuID0gbi5wYXJlbnQ7XG4gIH1cbiAgaWYgKFxuICAgIG4ucGFyZW50LnR5cGUgPT09ICdWYXJpYWJsZURlY2xhcmF0b3InXG4gICAgJiYgbi5wYXJlbnQucGFyZW50LnR5cGUgPT09ICdWYXJpYWJsZURlY2xhcmF0aW9uJ1xuICAgICYmIG4ucGFyZW50LnBhcmVudC5wYXJlbnQudHlwZSA9PT0gJ1Byb2dyYW0nXG4gICkge1xuICAgIHJldHVybiBuLnBhcmVudC5wYXJlbnQucGFyZW50O1xuICB9XG59XG5cbmNvbnN0IHR5cGVzID0gWydidWlsdGluJywgJ2V4dGVybmFsJywgJ2ludGVybmFsJywgJ3Vua25vd24nLCAncGFyZW50JywgJ3NpYmxpbmcnLCAnaW5kZXgnLCAnb2JqZWN0JywgJ3R5cGUnXTtcblxuLy8gQ3JlYXRlcyBhbiBvYmplY3Qgd2l0aCB0eXBlLXJhbmsgcGFpcnMuXG4vLyBFeGFtcGxlOiB7IGluZGV4OiAwLCBzaWJsaW5nOiAxLCBwYXJlbnQ6IDEsIGV4dGVybmFsOiAxLCBidWlsdGluOiAyLCBpbnRlcm5hbDogMiB9XG4vLyBXaWxsIHRocm93IGFuIGVycm9yIGlmIGl0IGNvbnRhaW5zIGEgdHlwZSB0aGF0IGRvZXMgbm90IGV4aXN0LCBvciBoYXMgYSBkdXBsaWNhdGVcbmZ1bmN0aW9uIGNvbnZlcnRHcm91cHNUb1JhbmtzKGdyb3Vwcykge1xuICBpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMSkge1xuICAgIC8vIFRPRE86IHJlbW92ZSB0aGlzIGBpZmAgYW5kIGZpeCB0aGUgYnVnXG4gICAgcmV0dXJuIGNvbnZlcnRHcm91cHNUb1JhbmtzKGdyb3Vwc1swXSk7XG4gIH1cbiAgY29uc3QgcmFua09iamVjdCA9IGdyb3Vwcy5yZWR1Y2UoZnVuY3Rpb24gKHJlcywgZ3JvdXAsIGluZGV4KSB7XG4gICAgW10uY29uY2F0KGdyb3VwKS5mb3JFYWNoKGZ1bmN0aW9uIChncm91cEl0ZW0pIHtcbiAgICAgIGlmICh0eXBlcy5pbmRleE9mKGdyb3VwSXRlbSkgPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW5jb3JyZWN0IGNvbmZpZ3VyYXRpb24gb2YgdGhlIHJ1bGU6IFVua25vd24gdHlwZSBcXGAke0pTT04uc3RyaW5naWZ5KGdyb3VwSXRlbSl9XFxgYCk7XG4gICAgICB9XG4gICAgICBpZiAocmVzW2dyb3VwSXRlbV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEluY29ycmVjdCBjb25maWd1cmF0aW9uIG9mIHRoZSBydWxlOiBcXGAke2dyb3VwSXRlbX1cXGAgaXMgZHVwbGljYXRlZGApO1xuICAgICAgfVxuICAgICAgcmVzW2dyb3VwSXRlbV0gPSBpbmRleCAqIDI7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlcztcbiAgfSwge30pO1xuXG4gIGNvbnN0IG9taXR0ZWRUeXBlcyA9IHR5cGVzLmZpbHRlcihmdW5jdGlvbiAodHlwZSkge1xuICAgIHJldHVybiB0eXBlb2YgcmFua09iamVjdFt0eXBlXSA9PT0gJ3VuZGVmaW5lZCc7XG4gIH0pO1xuXG4gIGNvbnN0IHJhbmtzID0gb21pdHRlZFR5cGVzLnJlZHVjZShmdW5jdGlvbiAocmVzLCB0eXBlKSB7XG4gICAgcmVzW3R5cGVdID0gZ3JvdXBzLmxlbmd0aCAqIDI7XG4gICAgcmV0dXJuIHJlcztcbiAgfSwgcmFua09iamVjdCk7XG5cbiAgcmV0dXJuIHsgZ3JvdXBzOiByYW5rcywgb21pdHRlZFR5cGVzIH07XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQYXRoR3JvdXBzRm9yUmFua3MocGF0aEdyb3Vwcykge1xuICBjb25zdCBhZnRlciA9IHt9O1xuICBjb25zdCBiZWZvcmUgPSB7fTtcblxuICBjb25zdCB0cmFuc2Zvcm1lZCA9IHBhdGhHcm91cHMubWFwKChwYXRoR3JvdXAsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgeyBncm91cCwgcG9zaXRpb246IHBvc2l0aW9uU3RyaW5nIH0gPSBwYXRoR3JvdXA7XG4gICAgbGV0IHBvc2l0aW9uID0gMDtcbiAgICBpZiAocG9zaXRpb25TdHJpbmcgPT09ICdhZnRlcicpIHtcbiAgICAgIGlmICghYWZ0ZXJbZ3JvdXBdKSB7XG4gICAgICAgIGFmdGVyW2dyb3VwXSA9IDE7XG4gICAgICB9XG4gICAgICBwb3NpdGlvbiA9IGFmdGVyW2dyb3VwXSsrO1xuICAgIH0gZWxzZSBpZiAocG9zaXRpb25TdHJpbmcgPT09ICdiZWZvcmUnKSB7XG4gICAgICBpZiAoIWJlZm9yZVtncm91cF0pIHtcbiAgICAgICAgYmVmb3JlW2dyb3VwXSA9IFtdO1xuICAgICAgfVxuICAgICAgYmVmb3JlW2dyb3VwXS5wdXNoKGluZGV4KTtcbiAgICB9XG5cbiAgICByZXR1cm4geyAuLi5wYXRoR3JvdXAsIHBvc2l0aW9uIH07XG4gIH0pO1xuXG4gIGxldCBtYXhQb3NpdGlvbiA9IDE7XG5cbiAgT2JqZWN0LmtleXMoYmVmb3JlKS5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGNvbnN0IGdyb3VwTGVuZ3RoID0gYmVmb3JlW2dyb3VwXS5sZW5ndGg7XG4gICAgYmVmb3JlW2dyb3VwXS5mb3JFYWNoKChncm91cEluZGV4LCBpbmRleCkgPT4ge1xuICAgICAgdHJhbnNmb3JtZWRbZ3JvdXBJbmRleF0ucG9zaXRpb24gPSAtMSAqIChncm91cExlbmd0aCAtIGluZGV4KTtcbiAgICB9KTtcbiAgICBtYXhQb3NpdGlvbiA9IE1hdGgubWF4KG1heFBvc2l0aW9uLCBncm91cExlbmd0aCk7XG4gIH0pO1xuXG4gIE9iamVjdC5rZXlzKGFmdGVyKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICBjb25zdCBncm91cE5leHRQb3NpdGlvbiA9IGFmdGVyW2tleV07XG4gICAgbWF4UG9zaXRpb24gPSBNYXRoLm1heChtYXhQb3NpdGlvbiwgZ3JvdXBOZXh0UG9zaXRpb24gLSAxKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBwYXRoR3JvdXBzOiB0cmFuc2Zvcm1lZCxcbiAgICBtYXhQb3NpdGlvbjogbWF4UG9zaXRpb24gPiAxMCA/IE1hdGgucG93KDEwLCBNYXRoLmNlaWwoTWF0aC5sb2cxMChtYXhQb3NpdGlvbikpKSA6IDEwLFxuICB9O1xufVxuXG5mdW5jdGlvbiBmaXhOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgcHJldmlvdXNJbXBvcnQpIHtcbiAgY29uc3QgcHJldlJvb3QgPSBmaW5kUm9vdE5vZGUocHJldmlvdXNJbXBvcnQubm9kZSk7XG4gIGNvbnN0IHRva2Vuc1RvRW5kT2ZMaW5lID0gdGFrZVRva2Vuc0FmdGVyV2hpbGUoXG4gICAgY29udGV4dC5nZXRTb3VyY2VDb2RlKCksIHByZXZSb290LCBjb21tZW50T25TYW1lTGluZUFzKHByZXZSb290KSk7XG5cbiAgbGV0IGVuZE9mTGluZSA9IHByZXZSb290LnJhbmdlWzFdO1xuICBpZiAodG9rZW5zVG9FbmRPZkxpbmUubGVuZ3RoID4gMCkge1xuICAgIGVuZE9mTGluZSA9IHRva2Vuc1RvRW5kT2ZMaW5lW3Rva2Vuc1RvRW5kT2ZMaW5lLmxlbmd0aCAtIDFdLnJhbmdlWzFdO1xuICB9XG4gIHJldHVybiAoZml4ZXIpID0+IGZpeGVyLmluc2VydFRleHRBZnRlclJhbmdlKFtwcmV2Um9vdC5yYW5nZVswXSwgZW5kT2ZMaW5lXSwgJ1xcbicpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpIHtcbiAgY29uc3Qgc291cmNlQ29kZSA9IGNvbnRleHQuZ2V0U291cmNlQ29kZSgpO1xuICBjb25zdCBwcmV2Um9vdCA9IGZpbmRSb290Tm9kZShwcmV2aW91c0ltcG9ydC5ub2RlKTtcbiAgY29uc3QgY3VyclJvb3QgPSBmaW5kUm9vdE5vZGUoY3VycmVudEltcG9ydC5ub2RlKTtcbiAgY29uc3QgcmFuZ2VUb1JlbW92ZSA9IFtcbiAgICBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIHByZXZSb290KSxcbiAgICBmaW5kU3RhcnRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgY3VyclJvb3QpLFxuICBdO1xuICBpZiAoKC9eXFxzKiQvKS50ZXN0KHNvdXJjZUNvZGUudGV4dC5zdWJzdHJpbmcocmFuZ2VUb1JlbW92ZVswXSwgcmFuZ2VUb1JlbW92ZVsxXSkpKSB7XG4gICAgcmV0dXJuIChmaXhlcikgPT4gZml4ZXIucmVtb3ZlUmFuZ2UocmFuZ2VUb1JlbW92ZSk7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbWFrZU5ld2xpbmVzQmV0d2VlblJlcG9ydChjb250ZXh0LCBpbXBvcnRlZCwgbmV3bGluZXNCZXR3ZWVuSW1wb3J0cywgZGlzdGluY3RHcm91cCkge1xuICBjb25zdCBnZXROdW1iZXJPZkVtcHR5TGluZXNCZXR3ZWVuID0gKGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KSA9PiB7XG4gICAgY29uc3QgbGluZXNCZXR3ZWVuSW1wb3J0cyA9IGNvbnRleHQuZ2V0U291cmNlQ29kZSgpLmxpbmVzLnNsaWNlKFxuICAgICAgcHJldmlvdXNJbXBvcnQubm9kZS5sb2MuZW5kLmxpbmUsXG4gICAgICBjdXJyZW50SW1wb3J0Lm5vZGUubG9jLnN0YXJ0LmxpbmUgLSAxLFxuICAgICk7XG5cbiAgICByZXR1cm4gbGluZXNCZXR3ZWVuSW1wb3J0cy5maWx0ZXIoKGxpbmUpID0+ICFsaW5lLnRyaW0oKS5sZW5ndGgpLmxlbmd0aDtcbiAgfTtcbiAgY29uc3QgZ2V0SXNTdGFydE9mRGlzdGluY3RHcm91cCA9IChjdXJyZW50SW1wb3J0LCBwcmV2aW91c0ltcG9ydCkgPT4gY3VycmVudEltcG9ydC5yYW5rIC0gMSA+PSBwcmV2aW91c0ltcG9ydC5yYW5rO1xuICBsZXQgcHJldmlvdXNJbXBvcnQgPSBpbXBvcnRlZFswXTtcblxuICBpbXBvcnRlZC5zbGljZSgxKS5mb3JFYWNoKGZ1bmN0aW9uIChjdXJyZW50SW1wb3J0KSB7XG4gICAgY29uc3QgZW1wdHlMaW5lc0JldHdlZW4gPSBnZXROdW1iZXJPZkVtcHR5TGluZXNCZXR3ZWVuKGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KTtcbiAgICBjb25zdCBpc1N0YXJ0T2ZEaXN0aW5jdEdyb3VwID0gZ2V0SXNTdGFydE9mRGlzdGluY3RHcm91cChjdXJyZW50SW1wb3J0LCBwcmV2aW91c0ltcG9ydCk7XG5cbiAgICBpZiAobmV3bGluZXNCZXR3ZWVuSW1wb3J0cyA9PT0gJ2Fsd2F5cydcbiAgICAgICAgfHwgbmV3bGluZXNCZXR3ZWVuSW1wb3J0cyA9PT0gJ2Fsd2F5cy1hbmQtaW5zaWRlLWdyb3VwcycpIHtcbiAgICAgIGlmIChjdXJyZW50SW1wb3J0LnJhbmsgIT09IHByZXZpb3VzSW1wb3J0LnJhbmsgJiYgZW1wdHlMaW5lc0JldHdlZW4gPT09IDApIHtcbiAgICAgICAgaWYgKGRpc3RpbmN0R3JvdXAgfHwgIWRpc3RpbmN0R3JvdXAgJiYgaXNTdGFydE9mRGlzdGluY3RHcm91cCkge1xuICAgICAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgICAgIG5vZGU6IHByZXZpb3VzSW1wb3J0Lm5vZGUsXG4gICAgICAgICAgICBtZXNzYWdlOiAnVGhlcmUgc2hvdWxkIGJlIGF0IGxlYXN0IG9uZSBlbXB0eSBsaW5lIGJldHdlZW4gaW1wb3J0IGdyb3VwcycsXG4gICAgICAgICAgICBmaXg6IGZpeE5ld0xpbmVBZnRlckltcG9ydChjb250ZXh0LCBwcmV2aW91c0ltcG9ydCksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZW1wdHlMaW5lc0JldHdlZW4gPiAwXG4gICAgICAgICYmIG5ld2xpbmVzQmV0d2VlbkltcG9ydHMgIT09ICdhbHdheXMtYW5kLWluc2lkZS1ncm91cHMnKSB7XG4gICAgICAgIGlmIChkaXN0aW5jdEdyb3VwICYmIGN1cnJlbnRJbXBvcnQucmFuayA9PT0gcHJldmlvdXNJbXBvcnQucmFuayB8fCAhZGlzdGluY3RHcm91cCAmJiAhaXNTdGFydE9mRGlzdGluY3RHcm91cCkge1xuICAgICAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgICAgIG5vZGU6IHByZXZpb3VzSW1wb3J0Lm5vZGUsXG4gICAgICAgICAgICBtZXNzYWdlOiAnVGhlcmUgc2hvdWxkIGJlIG5vIGVtcHR5IGxpbmUgd2l0aGluIGltcG9ydCBncm91cCcsXG4gICAgICAgICAgICBmaXg6IHJlbW92ZU5ld0xpbmVBZnRlckltcG9ydChjb250ZXh0LCBjdXJyZW50SW1wb3J0LCBwcmV2aW91c0ltcG9ydCksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGVtcHR5TGluZXNCZXR3ZWVuID4gMCkge1xuICAgICAgY29udGV4dC5yZXBvcnQoe1xuICAgICAgICBub2RlOiBwcmV2aW91c0ltcG9ydC5ub2RlLFxuICAgICAgICBtZXNzYWdlOiAnVGhlcmUgc2hvdWxkIGJlIG5vIGVtcHR5IGxpbmUgYmV0d2VlbiBpbXBvcnQgZ3JvdXBzJyxcbiAgICAgICAgZml4OiByZW1vdmVOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJldmlvdXNJbXBvcnQgPSBjdXJyZW50SW1wb3J0O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0QWxwaGFiZXRpemVDb25maWcob3B0aW9ucykge1xuICBjb25zdCBhbHBoYWJldGl6ZSA9IG9wdGlvbnMuYWxwaGFiZXRpemUgfHwge307XG4gIGNvbnN0IG9yZGVyID0gYWxwaGFiZXRpemUub3JkZXIgfHwgJ2lnbm9yZSc7XG4gIGNvbnN0IG9yZGVySW1wb3J0S2luZCA9IGFscGhhYmV0aXplLm9yZGVySW1wb3J0S2luZCB8fCAnaWdub3JlJztcbiAgY29uc3QgY2FzZUluc2Vuc2l0aXZlID0gYWxwaGFiZXRpemUuY2FzZUluc2Vuc2l0aXZlIHx8IGZhbHNlO1xuXG4gIHJldHVybiB7IG9yZGVyLCBvcmRlckltcG9ydEtpbmQsIGNhc2VJbnNlbnNpdGl2ZSB9O1xufVxuXG4vLyBUT0RPLCBzZW12ZXItbWFqb3I6IENoYW5nZSB0aGUgZGVmYXVsdCBvZiBcImRpc3RpbmN0R3JvdXBcIiBmcm9tIHRydWUgdG8gZmFsc2VcbmNvbnN0IGRlZmF1bHREaXN0aW5jdEdyb3VwID0gdHJ1ZTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1ldGE6IHtcbiAgICB0eXBlOiAnc3VnZ2VzdGlvbicsXG4gICAgZG9jczoge1xuICAgICAgY2F0ZWdvcnk6ICdTdHlsZSBndWlkZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VuZm9yY2UgYSBjb252ZW50aW9uIGluIG1vZHVsZSBpbXBvcnQgb3JkZXIuJyxcbiAgICAgIHVybDogZG9jc1VybCgnb3JkZXInKSxcbiAgICB9LFxuXG4gICAgZml4YWJsZTogJ2NvZGUnLFxuICAgIHNjaGVtYTogW1xuICAgICAge1xuICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgIGdyb3Vwczoge1xuICAgICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzOiB7XG4gICAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgZGlzdGluY3RHcm91cDoge1xuICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICAgICAgZGVmYXVsdDogZGVmYXVsdERpc3RpbmN0R3JvdXAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwYXRoR3JvdXBzOiB7XG4gICAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgICAgaXRlbXM6IHtcbiAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICBwYXR0ZXJuOiB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHBhdHRlcm5PcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGdyb3VwOiB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgIGVudW06IHR5cGVzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgcG9zaXRpb246IHtcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgICAgICAgICAgZW51bTogWydhZnRlcicsICdiZWZvcmUnXSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ3BhdHRlcm4nLCAnZ3JvdXAnXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAnbmV3bGluZXMtYmV0d2Vlbic6IHtcbiAgICAgICAgICAgIGVudW06IFtcbiAgICAgICAgICAgICAgJ2lnbm9yZScsXG4gICAgICAgICAgICAgICdhbHdheXMnLFxuICAgICAgICAgICAgICAnYWx3YXlzLWFuZC1pbnNpZGUtZ3JvdXBzJyxcbiAgICAgICAgICAgICAgJ25ldmVyJyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhbHBoYWJldGl6ZToge1xuICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZToge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgb3JkZXI6IHtcbiAgICAgICAgICAgICAgICBlbnVtOiBbJ2lnbm9yZScsICdhc2MnLCAnZGVzYyddLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICdpZ25vcmUnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBvcmRlckltcG9ydEtpbmQ6IHtcbiAgICAgICAgICAgICAgICBlbnVtOiBbJ2lnbm9yZScsICdhc2MnLCAnZGVzYyddLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICdpZ25vcmUnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHdhcm5PblVuYXNzaWduZWRJbXBvcnRzOiB7XG4gICAgICAgICAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgICAgICAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICB9LFxuICAgIF0sXG4gIH0sXG5cbiAgY3JlYXRlOiBmdW5jdGlvbiBpbXBvcnRPcmRlclJ1bGUoY29udGV4dCkge1xuICAgIGNvbnN0IG9wdGlvbnMgPSBjb250ZXh0Lm9wdGlvbnNbMF0gfHwge307XG4gICAgY29uc3QgbmV3bGluZXNCZXR3ZWVuSW1wb3J0cyA9IG9wdGlvbnNbJ25ld2xpbmVzLWJldHdlZW4nXSB8fCAnaWdub3JlJztcbiAgICBjb25zdCBwYXRoR3JvdXBzRXhjbHVkZWRJbXBvcnRUeXBlcyA9IG5ldyBTZXQob3B0aW9ucy5wYXRoR3JvdXBzRXhjbHVkZWRJbXBvcnRUeXBlcyB8fCBbJ2J1aWx0aW4nLCAnZXh0ZXJuYWwnLCAnb2JqZWN0J10pO1xuICAgIGNvbnN0IGFscGhhYmV0aXplID0gZ2V0QWxwaGFiZXRpemVDb25maWcob3B0aW9ucyk7XG4gICAgY29uc3QgZGlzdGluY3RHcm91cCA9IG9wdGlvbnMuZGlzdGluY3RHcm91cCA9PSBudWxsID8gZGVmYXVsdERpc3RpbmN0R3JvdXAgOiAhIW9wdGlvbnMuZGlzdGluY3RHcm91cDtcbiAgICBsZXQgcmFua3M7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBwYXRoR3JvdXBzLCBtYXhQb3NpdGlvbiB9ID0gY29udmVydFBhdGhHcm91cHNGb3JSYW5rcyhvcHRpb25zLnBhdGhHcm91cHMgfHwgW10pO1xuICAgICAgY29uc3QgeyBncm91cHMsIG9taXR0ZWRUeXBlcyB9ID0gY29udmVydEdyb3Vwc1RvUmFua3Mob3B0aW9ucy5ncm91cHMgfHwgZGVmYXVsdEdyb3Vwcyk7XG4gICAgICByYW5rcyA9IHtcbiAgICAgICAgZ3JvdXBzLFxuICAgICAgICBvbWl0dGVkVHlwZXMsXG4gICAgICAgIHBhdGhHcm91cHMsXG4gICAgICAgIG1heFBvc2l0aW9uLFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gTWFsZm9ybWVkIGNvbmZpZ3VyYXRpb25cbiAgICAgIHJldHVybiB7XG4gICAgICAgIFByb2dyYW0obm9kZSkge1xuICAgICAgICAgIGNvbnRleHQucmVwb3J0KG5vZGUsIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9XG4gICAgY29uc3QgaW1wb3J0TWFwID0gbmV3IE1hcCgpO1xuXG4gICAgZnVuY3Rpb24gZ2V0QmxvY2tJbXBvcnRzKG5vZGUpIHtcbiAgICAgIGlmICghaW1wb3J0TWFwLmhhcyhub2RlKSkge1xuICAgICAgICBpbXBvcnRNYXAuc2V0KG5vZGUsIFtdKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpbXBvcnRNYXAuZ2V0KG5vZGUpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBJbXBvcnREZWNsYXJhdGlvbjogZnVuY3Rpb24gaGFuZGxlSW1wb3J0cyhub2RlKSB7XG4gICAgICAgIC8vIElnbm9yaW5nIHVuYXNzaWduZWQgaW1wb3J0cyB1bmxlc3Mgd2Fybk9uVW5hc3NpZ25lZEltcG9ydHMgaXMgc2V0XG4gICAgICAgIGlmIChub2RlLnNwZWNpZmllcnMubGVuZ3RoIHx8IG9wdGlvbnMud2Fybk9uVW5hc3NpZ25lZEltcG9ydHMpIHtcbiAgICAgICAgICBjb25zdCBuYW1lID0gbm9kZS5zb3VyY2UudmFsdWU7XG4gICAgICAgICAgcmVnaXN0ZXJOb2RlKFxuICAgICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgICAgdmFsdWU6IG5hbWUsXG4gICAgICAgICAgICAgIGRpc3BsYXlOYW1lOiBuYW1lLFxuICAgICAgICAgICAgICB0eXBlOiAnaW1wb3J0JyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICByYW5rcyxcbiAgICAgICAgICAgIGdldEJsb2NrSW1wb3J0cyhub2RlLnBhcmVudCksXG4gICAgICAgICAgICBwYXRoR3JvdXBzRXhjbHVkZWRJbXBvcnRUeXBlcyxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgVFNJbXBvcnRFcXVhbHNEZWNsYXJhdGlvbjogZnVuY3Rpb24gaGFuZGxlSW1wb3J0cyhub2RlKSB7XG4gICAgICAgIGxldCBkaXNwbGF5TmFtZTtcbiAgICAgICAgbGV0IHZhbHVlO1xuICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgLy8gc2tpcCBcImV4cG9ydCBpbXBvcnRcInNcbiAgICAgICAgaWYgKG5vZGUuaXNFeHBvcnQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5vZGUubW9kdWxlUmVmZXJlbmNlLnR5cGUgPT09ICdUU0V4dGVybmFsTW9kdWxlUmVmZXJlbmNlJykge1xuICAgICAgICAgIHZhbHVlID0gbm9kZS5tb2R1bGVSZWZlcmVuY2UuZXhwcmVzc2lvbi52YWx1ZTtcbiAgICAgICAgICBkaXNwbGF5TmFtZSA9IHZhbHVlO1xuICAgICAgICAgIHR5cGUgPSAnaW1wb3J0JztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZSA9ICcnO1xuICAgICAgICAgIGRpc3BsYXlOYW1lID0gY29udGV4dC5nZXRTb3VyY2VDb2RlKCkuZ2V0VGV4dChub2RlLm1vZHVsZVJlZmVyZW5jZSk7XG4gICAgICAgICAgdHlwZSA9ICdpbXBvcnQ6b2JqZWN0JztcbiAgICAgICAgfVxuICAgICAgICByZWdpc3Rlck5vZGUoXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICBkaXNwbGF5TmFtZSxcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgfSxcbiAgICAgICAgICByYW5rcyxcbiAgICAgICAgICBnZXRCbG9ja0ltcG9ydHMobm9kZS5wYXJlbnQpLFxuICAgICAgICAgIHBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzLFxuICAgICAgICApO1xuICAgICAgfSxcbiAgICAgIENhbGxFeHByZXNzaW9uOiBmdW5jdGlvbiBoYW5kbGVSZXF1aXJlcyhub2RlKSB7XG4gICAgICAgIGlmICghaXNTdGF0aWNSZXF1aXJlKG5vZGUpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJsb2NrID0gZ2V0UmVxdWlyZUJsb2NrKG5vZGUpO1xuICAgICAgICBpZiAoIWJsb2NrKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG5hbWUgPSBub2RlLmFyZ3VtZW50c1swXS52YWx1ZTtcbiAgICAgICAgcmVnaXN0ZXJOb2RlKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAge1xuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgIHZhbHVlOiBuYW1lLFxuICAgICAgICAgICAgZGlzcGxheU5hbWU6IG5hbWUsXG4gICAgICAgICAgICB0eXBlOiAncmVxdWlyZScsXG4gICAgICAgICAgfSxcbiAgICAgICAgICByYW5rcyxcbiAgICAgICAgICBnZXRCbG9ja0ltcG9ydHMoYmxvY2spLFxuICAgICAgICAgIHBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzLFxuICAgICAgICApO1xuICAgICAgfSxcbiAgICAgICdQcm9ncmFtOmV4aXQnOiBmdW5jdGlvbiByZXBvcnRBbmRSZXNldCgpIHtcbiAgICAgICAgaW1wb3J0TWFwLmZvckVhY2goKGltcG9ydGVkKSA9PiB7XG4gICAgICAgICAgaWYgKG5ld2xpbmVzQmV0d2VlbkltcG9ydHMgIT09ICdpZ25vcmUnKSB7XG4gICAgICAgICAgICBtYWtlTmV3bGluZXNCZXR3ZWVuUmVwb3J0KGNvbnRleHQsIGltcG9ydGVkLCBuZXdsaW5lc0JldHdlZW5JbXBvcnRzLCBkaXN0aW5jdEdyb3VwKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoYWxwaGFiZXRpemUub3JkZXIgIT09ICdpZ25vcmUnKSB7XG4gICAgICAgICAgICBtdXRhdGVSYW5rc1RvQWxwaGFiZXRpemUoaW1wb3J0ZWQsIGFscGhhYmV0aXplKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBtYWtlT3V0T2ZPcmRlclJlcG9ydChjb250ZXh0LCBpbXBvcnRlZCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGltcG9ydE1hcC5jbGVhcigpO1xuICAgICAgfSxcbiAgICB9O1xuICB9LFxufTtcbiJdfQ==