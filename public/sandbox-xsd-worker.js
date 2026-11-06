import {validateXML} from './vendor/xmllint/index-browser.mjs';
self.onmessage=async event=>{try{self.postMessage({result:await validateXML(event.data)});}catch(error){self.postMessage({error:error.message});}};
