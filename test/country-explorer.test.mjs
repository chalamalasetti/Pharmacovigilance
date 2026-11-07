import test from 'node:test';
import assert from 'node:assert/strict';
import {searchMatches,searchFold} from '../public/search-normalization.js';
import {countryScope,prepareCountryProducts,filterCountryProducts,countryExport,productStatus} from '../public/country-explorer-lib.js';
test('search accepts case, accents, word order and spaced identifiers without changing identity',()=>{
 assert(searchMatches('ATORVASTATIN lipitor',['Lipitor','atorvastatin']));
 assert(searchMatches('nda 020702','NDA020702'));
 assert.equal(searchFold('São-Paulo'),'sao paulo');
 assert(!searchMatches('020703','NDA020702'));
});
test('national coverage and EU centralised coverage remain distinct',()=>{
 assert.equal(countryScope('DE').market,'EU');assert.equal(countryScope('DE').national,false);
 assert.equal(countryScope('US').national,true);assert.equal(countryScope('IN').market,null);
});
test('listing, authorisation and marketed claims never collapse',()=>{
 assert.equal(productStatus({sourceId:'fda-ndc',status:'active'}),'listing');
 assert.equal(productStatus({sourceId:'hc-dpd',status:'Marketed'}),'marketed');
 assert.equal(productStatus({sourceId:'ema-medicines',status:'Authorised'}),'authorization');
 assert.equal(productStatus({sourceId:'hc-dpd',status:'Cancelled post market'}),'past');
 assert.equal(productStatus({sourceId:'fda-ndc'}),'unknown');
});
test('filters and evidence exports preserve record provenance and missing coverage',()=>{
 const rows=prepareCountryProducts([{id:'1',brand:'Lipitor',application:'NDA020702',authId:'NDA020702',ingredients:['Atorvastatin'],company:'Example',market:'US',sourceId:'fda-drugsfda',status:'Prescription',hash:'abc',url:'https://www.fda.gov/'}]);
 assert.equal(filterCountryProducts(rows,{q:'atorvastatin LIPITOR nda 020702'}).length,1);
 const output=countryExport({country:{code:'US'},scope:countryScope('US'),coverage:{repository:'unavailable'},products:rows});
 assert.equal(output.products[0].hash,'abc');assert.equal(output.products[0]._search,undefined);
 assert.equal(output.coverage.repository,'unavailable');assert.match(output.notice,/not a complete national register/);
});
