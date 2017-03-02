import * as SourceMap from "source-map";
import * as $ from "jquery";
var LINESTYLES = 6;
var MAX_LINES = 5000;

export function generateHtml(map: SourceMap.SourceMapConsumer, generatedCode: string, sources: string[]): JQuery {
	var generatedSide: JQuery[][] = [];
	var originalSide: JQuery[][] = [];
	var mappingsSide: JQuery[][] = [];

	function addTo(side: JQuery[][], line: number, html: JQuery, uid: string): void {
		if (html.text().length === 0) return;
		side[line] = (side[line] || []).concat(html);
		if (uid) {
			html.attr("data-key", uid);
			html.addClass("style-" + (+uid.split(";")[1]%LINESTYLES));
		}
	}

	function text(content: string): JQuery {
		return $("<span>").text(content);
	}
	function span(content: string | number, options: any): JQuery {
		const result = $("<span>");

		if(options) {
			if(options.generated) {
				result.addClass("generated-item");
			} else if(options.mapping) {
				result.addClass("mapping-item");
			} else {
				result.addClass("original-item");
			}
			if(typeof options.source !== "undefined") {
				result.addClass("item-" + options.source + "-" + options.line + "-" + options.column);
			}
			result.attr("title", options.name);
		}
		result.text(content);
		return result;
	}

	var mapSources = (map as any).sources;

	const getKey = (mapping: SourceMap.MappingItem) => mapping.generatedColumn === undefined ? null : mapping.generatedColumn + ";" + mapping.generatedLine;

	var generatedLine = 1;
	var nodes = SourceMap.SourceNode.fromStringWithSourceMap(generatedCode, map).children;
	nodes.forEach(function(item, idx) {
		if(generatedLine > MAX_LINES) return;
		var str = item.toString();
		var source = mapSources.indexOf(item.source);
		str.split("\n").forEach(function(line) {
			const col = (generatedSide[generatedLine] || []).reduce((c, j) => c + j.text().length, 0);
			addTo(generatedSide, generatedLine, span(line, {
				generated: true,
				source: source,
				line: item.line,
				column: item.column,
				name: item.name
			}), item.line === undefined ? null : getKey({ generatedColumn: col, generatedLine: generatedLine, name: null, source: null, originalColumn: null, originalLine: null }));
			generatedLine++;
		});
		generatedLine--;
	});

	var lastGenLine = 1;
	var lastOrgSource = "";
	var mappingsLine = 1;
	map.eachMapping(mapping => {
		if(mapping.generatedLine > MAX_LINES) return;
		while(lastGenLine < mapping.generatedLine) {
			mappingsLine++;
			lastGenLine++;
			addTo(mappingsSide, mappingsLine, text(lastGenLine + ": "), null);
		}
		if(typeof mapping.originalLine === "number") {
			if(lastOrgSource !== mapping.source && mapSources.length > 1) {
				addTo(mappingsSide, mappingsLine, text("[" + mapping.source + "] "), getKey(mapping));
				lastOrgSource = mapping.source;
			}
			var source = mapSources.indexOf(mapping.source);
			addTo(mappingsSide, mappingsLine, span(mapping.generatedColumn + "->" + mapping.originalLine + ":" + mapping.originalColumn, {
				mapping: true,
				source: source,
				line: mapping.originalLine,
				column: mapping.originalColumn
			}), getKey(mapping));
		} else {
			addTo(mappingsSide, mappingsLine, span(mapping.generatedColumn, { mapping: true }), getKey(mapping));
		}
		addTo(mappingsSide, mappingsLine, text("  "), null);
	});


	var originalLine = 1;
	var line = 1, column = 0, currentOutputLine = 1, targetOutputLine = -1, limited = false;
	var lastMapping: SourceMap.MappingItem = null;
	var currentSource: string = null;
	var exampleLines: string[];
	var mappingsBySource: { [key: string]: SourceMap.MappingItem[] } = {};
	map.eachMapping(mapping => {
		if(typeof mapping.originalLine !== "number") return;
		if(mapping.generatedLine > MAX_LINES) { limited = true; return }
		if(!mappingsBySource[mapping.source]) mappingsBySource[mapping.source] = [];
		mappingsBySource[mapping.source].push(mapping);
	}, undefined, SourceMap.SourceMapConsumer.ORIGINAL_ORDER);
	Object.keys(mappingsBySource).map<[string, number]>(source => {
		return [source, mappingsBySource[source][0].generatedLine];
	}).sort((a, b) => {
		if(a[0] === "?") return 1;
		if(b[0] === "?") return -1;
		return a[1] - b[1];
	}).forEach(function(arr) {
		console.log(arr);
		var source = arr[0];
		var mappings = mappingsBySource[source];

		if(currentSource) endFile();
		lastMapping = null;
		line = 1;
		column = 0;
		targetOutputLine = -1;
		if(mapSources.length > 1) {
			currentOutputLine++;
		}
		var startLine = mappings.map(function(mapping) {
			return mapping.generatedLine - mapping.originalLine + 1;
		}).sort(function(a, b) { return a - b })[0];
		while(currentOutputLine < startLine) {
			originalLine++;
			currentOutputLine++;
		}
		if(mapSources.length > 1) {
			addTo(originalSide, originalLine, $("<h4>").text(source), null);
			originalLine++;
		}
		var exampleSource = sources[mapSources.indexOf(source)];
		if(!exampleSource) throw new Error("Source '" + source + "' missing");
		exampleLines = exampleSource.split("\n");
		currentSource = source;
		mappings.forEach(function(mapping, idx) {
			if(lastMapping) {
				var source = mapSources.indexOf(lastMapping.source);
				if(line < mapping.originalLine) {
					addTo(originalSide, originalLine, span(exampleLines.shift(), {
						original: true,
						source: source,
						line: lastMapping.originalLine,
						column: lastMapping.originalColumn
					}), getKey(lastMapping));
					originalLine++;
					line++; column = 0;
					currentOutputLine++;
					while(line < mapping.originalLine) {
						addTo(originalSide, originalLine, text(exampleLines.shift()), null);
						originalLine++;
						line++; column = 0;
						currentOutputLine++;
					}
					let startLinex = [];
					for(var i = idx; i < mappings.length && mappings[i].originalLine <= mapping.originalLine + 1; i++) {
						startLinex.push(mappings[i].generatedLine - mappings[i].originalLine + mapping.originalLine);
					}
					startLinex.sort((a, b) => a - b);
					startLine = startLinex[0];
					while(typeof startLine !== "undefined" && currentOutputLine < startLine) {
						//addTo(originalSide, originalLine, text("~"));
						//originalLine++;
						currentOutputLine++;
					}
					if(column < mapping.originalColumn) {
						addTo(originalSide, originalLine, text(shiftColumns(mapping.originalColumn - column)), null);
					}
				}
				if(mapping.originalColumn > column) {
					addTo(originalSide, originalLine, span(shiftColumns(mapping.originalColumn - column), {
						original: true,
						source: source,
						line: lastMapping.originalLine,
						column: lastMapping.originalColumn
					}), null);
				}
			} else {
				while(line < mapping.originalLine) {
					addTo(originalSide, originalLine, text(exampleLines.shift()), null);
					originalLine++;
					line++; column = 0;
				}
				if(column < mapping.originalColumn) {
					addTo(originalSide, originalLine, text(shiftColumns(mapping.originalColumn - column)), null);
				}
			}
			lastMapping = mapping;
		});
	});
	function endFile() {
		if(lastMapping) {
			var source = mapSources.indexOf(lastMapping.source);
			addTo(originalSide, originalLine, span(exampleLines.shift(), {
				original: true,
				source: source,
				line: lastMapping.originalLine,
				column: lastMapping.originalColumn
			}), null);
		}
		if(!limited) {
			exampleLines.forEach(line => {
				originalLine++;
				currentOutputLine++;
				addTo(originalSide, originalLine, text(line), null);
			});
		}
	}
	endFile();

	function shiftColumns(count: number): string {
		var nextLine = exampleLines[0];
		exampleLines[0] = nextLine.substr(count);
		column += count;
		return nextLine.substr(0, count);
	}

	var length = Math.max(originalSide.length, generatedSide.length, mappingsSide.length);

	var tableRows: JQuery[][] = [];

	for(var i = 0; i < length; i++) {
		tableRows[i] = [
			originalSide[i] || [],
			generatedSide[i] || [],
			//mappingsSide[i] || []
		].map(function(cell) {
			return $("<td>").append(cell);
		});
	}

	const table = $("<table>");
	for (const row of tableRows) {
		table.append($("<tr>").append(row));
	}
	return table;
}