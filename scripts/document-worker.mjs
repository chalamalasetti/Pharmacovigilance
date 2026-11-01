import {parentPort,workerData} from 'node:worker_threads';
import {pdfParagraphs,htmlParagraphs,extractCandidates} from './document-extract.mjs';
try{const paragraphs=workerData.kind==='pdf'?await pdfParagraphs(workerData.bytes):htmlParagraphs(new TextDecoder().decode(workerData.bytes));parentPort.postMessage({ok:true,...extractCandidates(paragraphs)});}catch{parentPort.postMessage({ok:false});}
