#!/usr/bin/env node
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeResult,
  type TextEdit,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { formatBend } from "./formatter.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((): InitializeResult => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Full,
    documentFormattingProvider: true,
  },
  serverInfo: { name: "bend2-fmt-lsp", version: "0.1.0" },
}));

connection.onDocumentFormatting((params): TextEdit[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document || (document.languageId !== "bend" && document.languageId !== "bend2")) return [];
  const source = document.getText();
  const formatted = formatBend(source, params.options);
  if (formatted === source) return [];
  let start = 0;
  for (let at = 0; at < source.length && source[at] === formatted[at]; at++) {
    if (source[at] === "\n") start = at + 1;
  }
  // Keep only complete unchanged lines on either edge; never split CRLF.
  let end = source.length;
  let formattedEnd = formatted.length;
  for (let a = end, b = formattedEnd;
    a > start && b > start && source[a - 1] === formatted[b - 1];) {
    a--;
    b--;
    if ((a === start || source[a - 1] === "\n") && (b === start || formatted[b - 1] === "\n")) {
      end = a;
      formattedEnd = b;
    }
  }
  return [{
    range: { start: document.positionAt(start), end: document.positionAt(end) },
    newText: formatted.slice(start, formattedEnd),
  }];
});

documents.listen(connection);
connection.listen();
