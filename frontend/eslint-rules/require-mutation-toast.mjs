/** ESLint rule: warn when useMutation lacks onSuccess/onError with showToast (AGENTS.md). */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require showToast in useMutation onSuccess and onError callbacks',
    },
    messages: {
      missingToast:
        'useMutation should include onSuccess and onError handlers that call showToast (see AGENTS.md)',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'useMutation' &&
          node.arguments[0]?.type === 'ObjectExpression'
        ) {
          const text = context.sourceCode.getText(node.arguments[0]);
          if (!text.includes('onSuccess') || !text.includes('showToast')) {
            context.report({ node, messageId: 'missingToast' });
          }
        }
      },
    };
  },
};
