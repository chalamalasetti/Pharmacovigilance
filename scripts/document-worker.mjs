import {appendMaskingCandidates} from './document-masking-policy.mjs';
import {parentPort,workerData} from 'node:worker_threads';
import {pdfParagraphs,htmlParagraphs,extractCandidates,hash} from './document-extract.mjs';
try{const paragraphs=workerData.kind==='pdf'?await pdfParagraphs(workerData.bytes):htmlParagraphs(new TextDecoder().decode(workerData.bytes));parentPort.postMessage({ok:true,...appendMaskingCandidates(extractCandidates(paragraphs),paragraphs,{sourceHash:hash(new Uint8Array(workerData.bytes))})});}catch{parentPort.postMessage({ok:false});}
