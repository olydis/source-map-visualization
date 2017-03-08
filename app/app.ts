declare var require: any;
declare var escape: any, unescape: any;
require("imports?this=>window!jquery-hashchange");

import * as $$ from "jquery";
import * as SourceMap from "source-map";
import { generateHtml } from "./generateHtml";

const $: any = $$;

var exampleKinds = ["coffee", "simple-coffee", "typescript", "babel"];
var SOURCE_MAPPING_URL_REG_EXP = /\/\/[@#]\s*sourceMappingURL\s*=\s*data:[^\n]*?base64,([^\n]*)/;
var SOURCE_MAPPING_URL_REG_EXP2 = /\/\*\s*[@#]\s*sourceMappingURL\s*=\s*data:[^\n]*?base64,([^\n]*)\s*\*\//;

$(function() {
	require("bootstrap");
	require("./app.less");
	$("body").html(require("./app.jade")({kinds: exampleKinds}));

	var oldHash = "";
	$(".close").click(function() {
		window.location.hash = oldHash;
	});

	$(window).hashchange(function() {
		var exampleKind = window.location.hash.replace(/^#/, "");

		if(exampleKind !== "custom-choose")
			$(".custom-modal").modal("hide");

		if(exampleKind.indexOf("base64") === 0) {
			var input = exampleKind.split(",").slice(1).map(atob);
			var gen = input.shift();
			var map = JSON.parse(input.shift());
			loadExample(input, gen, map);
			oldHash = exampleKind;
			return;
		}
		exampleKind = exampleKind.toLowerCase();
		if(exampleKind === "custom") return;
		
		if(exampleKinds.indexOf(exampleKind) < 0) exampleKind = "typescript";
		var exampleJs = require("!raw!../example/"+exampleKind+"/example.js");
		var exampleMap = require("!json!../example/"+exampleKind+"/example.map");
		var sources = exampleMap.sourcesContent;
		if(!sources) {
			sources = [require("!raw!../example/"+exampleKind+"/example")];
		}
		loadExample(sources, exampleJs, exampleMap);
		$(".custom-link").text("");
		oldHash = exampleKind;
	});
	$(window).hashchange();

	$(window).on("dragenter dragover", function(e: JQueryEventObject) {
		e.stopPropagation();
		e.preventDefault();

		var m = $(".custom-modal").data("modal");
		if(m && m.isShown) return undefined;
		$(".custom-modal .modal-body").html(require("./custom-drag.jade")());
		$(".custom-modal").modal({
			show: true
		});
		$(".custom-error").addClass("hide");
		return false;
	});
	$(window).on("drop", function(e: JQueryEventObject) {
		e.stopPropagation();
		e.preventDefault();

		var files = (e.originalEvent as DragEvent).dataTransfer.files;
		var count = files.length;
		if(count === 0) return false;
		var filesData: { file: any, name: string, err: any, result: any }[] = Array.prototype.map.call(files, function(file: any) { return { file: file, name: file.name }; });
		filesData.forEach(function(data) {
			readFile(data.file, function(err, result) {
				data.err = err;
				data.result = result;
				if(--count === 0) finished();
			});
		});
		return false;
		function finished() {
			try {
				var erroredFiles = filesData.filter(function(data) { return data.err; });
				if(erroredFiles.length > 0) {
					var errorText = erroredFiles.map(function(data) {
						return data.name + ": " + data.err;
					}).join("\n");
					throw new Error(errorText);
				}
				var sourceMapFile: any, generatedFile;
				var javascriptWithSourceMap = filesData.filter(function(data) {
					return (/\.js$/.test(data.name) && SOURCE_MAPPING_URL_REG_EXP.test(data.result)) ||
							(/\.(css|js)$/.test(data.name) && SOURCE_MAPPING_URL_REG_EXP2.test(data.result));
				})[0];
				if(javascriptWithSourceMap) {
					if(typeof atob !== "function")
						throw new Error("Your browser doesn't support atob. Cannot decode base64.");
					// Extract SourceMap from base64 DataUrl
					generatedFile = javascriptWithSourceMap;
					filesData.splice(filesData.indexOf(generatedFile), 1);
					var generatedSource = generatedFile.result;
					var match = SOURCE_MAPPING_URL_REG_EXP.exec(generatedSource) || SOURCE_MAPPING_URL_REG_EXP2.exec(generatedSource);
					generatedFile.result = generatedFile.result.replace(SOURCE_MAPPING_URL_REG_EXP, "/* base64 source map removed */").replace(SOURCE_MAPPING_URL_REG_EXP2, "/* base64 source map removed */");
					sourceMapFile = {
						result: atob(match[1])
					};
					sourceMapFile.json = JSON.parse(sourceMapFile.result);
				} else {
					// Find SourceMap in provided files
					var mapFiles = filesData.filter(function(data) {
						return /\.map$/.test(data.name);
					});
					if(mapFiles.length === 1) {
						// Use the .map file as SourceMap
						sourceMapFile = mapFiles[0];
						filesData.splice(filesData.indexOf(sourceMapFile), 1);
					} else {
						var jsonFiles = filesData.filter(function(data) {
							return /\.json$/.test(data.name);
						});
						if(jsonFiles.length === 1) {
							// Use the .json file as SourceMap
							sourceMapFile = jsonFiles[0];
							filesData.splice(filesData.indexOf(sourceMapFile), 1);
						} else {
							throw new Error("No SourceMap provided.");
						}
					}
					sourceMapFile.json = JSON.parse(sourceMapFile.result);

					// get name from SourceMap
					var name = sourceMapFile.json.file;
					generatedFile = filesData.filter(function(data) {
						// The file with the exact name
						return data.name === name;
					})[0] || filesData.filter(function(data) {
						// The first js file
						return /\.js$/.test(data.name);
					})[0];
					if(!generatedFile) {
						throw Error("No original file provided.");
					}
					filesData.splice(filesData.indexOf(generatedFile), 1);
				}
				var providedSourcesContent = filesData.map(function(data) { return data.result; });
				var sourcesContentSet = sourceMapFile.json.sourcesContent && sourceMapFile.json.sourcesContent.length > 0
				if(providedSourcesContent.length > 0 && sourcesContentSet)
					throw new Error("Provided source files and sourcesContent in SourceMap is set.");
				loadCustomExample(
					sourcesContentSet ? sourceMapFile.json.sourcesContent : providedSourcesContent,
					generatedFile.result,
					sourceMapFile.json
				);
				$(".custom-modal").modal("hide");
			} catch(err) {
				return $(".custom-error").removeClass("hide").text(err.message).attr("title", err.stack);
			}
		}
	});

	function loadCustomExample(sourcesContent: string[], generatedSource: string, sourceMap: SourceMap.RawSourceMap) {
		loadExample(sourcesContent, generatedSource, sourceMap);
		const hash = "base64," + [generatedSource, JSON.stringify(sourceMap)].concat(sourcesContent as any).map(str => btoa(str)).join(",");
		window.location.hash = hash;
	}
	function loadExample(sources: string[], exampleJs: string, exampleMap: SourceMap.RawSourceMap) {
		var visu = $(".visu").hide().text("");

		try {
			exampleMap.file = exampleMap.file || "example.js";
			var map = new SourceMap.SourceMapConsumer(exampleMap);
			visu.append(generateHtml(map, exampleJs, sources));

			$("body").delegate(".mapping-item", "mouseenter", (evt: JQueryEventObject) => {
				$(".selected").removeClass("selected");
				const target = $(evt.target);
				const key = target.data('key');
				document.title = key;
				var mappedItems = $(`[data-key="${key}"]`);
				$(mappedItems).addClass("selected");
			}).delegate(".mapping-item", "click", (evt: JQueryEventObject) => {
				var twinItem = $(evt.target).data('twin');
				var elem = $(twinItem).get(0)
				if (elem && elem.scrollIntoViewIfNeeded)
					elem.scrollIntoViewIfNeeded();
			});

			visu.append($("<br>"));
		} catch(e) {
			throw e;
		} finally {
			visu.show();
		}
	}
});

function readFile<T>(file: Blob, callback: (err?: Error, result?: any) => any): void {
	var fileReader = new FileReader();
	fileReader.readAsText(file, "utf-8");
	fileReader.onload = function(e) {
		callback(null, fileReader.result);
	};
	fileReader.onabort = function(e) {
		return callback(new Error('File read cancelled'));
	};
	fileReader.onerror = function(evt: any) {
		switch(evt.target.error.code) {
			case evt.target.error.NOT_FOUND_ERR:
				return callback(new Error('File Not Found!'));
			case evt.target.error.NOT_READABLE_ERR:
				return callback(new Error('File is not readable'));
			case evt.target.error.ABORT_ERR:
				return callback();
			default:
				return callback(new Error('An error occurred reading this file.'));
		}
	};
}

function loadFile(fileInput: HTMLInputElement, callback: (err?: Error, result?: any) => any) {
	var file = fileInput.files[0];
	if (!file) return callback();
	readFile(file, callback);
}
