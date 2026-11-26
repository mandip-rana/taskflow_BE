/** Escapes user input so it can be safely used inside a RegExp. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = escapeRegex;
