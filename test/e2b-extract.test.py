import importlib.util,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('extract','scripts/e2b-extract.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Extract(unittest.TestCase):
 def test_suffix_and_page(self):
  lines=[('E.i.3.2 a Results in Death',108,'105'),('  User Guidance     A synthetic definition',108,'105'),('  Conformance       Required',108,'105'),('  Data Type         1N',108,'105'),('  Business Rule(s)  Keep this exception',109,'106'),('E.i.3.2 b Life Threatening',109,'106'),('  User Guidance     Another definition',109,'106'),('  Conformance       Required',109,'106'),('  Data Type         1N',109,'106')]
  with patch.object(m,'page_lines',return_value=lines):rows=m.core_records('unused')
  self.assertEqual([r['key'] for r in rows],['ICH:E.i.3.2a','ICH:E.i.3.2b']);self.assertEqual(rows[0]['location']['endPage'],109);self.assertIn('Keep this exception',rows[0]['attributes']['businessRules'])
 def test_vertically_centered_guidance_label_and_section_boundary(self):
  lines=[('C.2.r.5 Primary Source for Regulatory Purposes',64,'61'),('                        First guidance line above its label',64,'61'),('  User Guidance         Second guidance line',64,'61'),('  Conformance           Required',64,'61'),('  Data Type             1N',64,'61'),('  Business Rule(s)      Rule and exception',64,'61'),('C.3 INFORMATION ON SENDER OF CASE SAFETY REPORT',65,'62')]
  with patch.object(m,'page_lines',return_value=lines):r=m.core_records('unused')[0]
  self.assertEqual(r['title'],'Primary Source for Regulatory Purposes');self.assertIn('First guidance line',r['attributes']['guidance']);self.assertNotIn('INFORMATION ON SENDER',r['attributes']['businessRules'])
 def test_chapter_intro_is_not_previous_fields_business_rule(self):
  lines=[('C.5.4 Study Type',70,'67'),('  User Guidance         Classify study type',70,'67'),('  Conformance           Conditional',70,'67'),('  Data Type             1N',70,'67'),('  Business Rule(s)      Source condition',70,'67'),('D PATIENT CHARACTERISTICS',71,'68'),('Patient section introduction',71,'68')]
  with patch.object(m,'page_lines',return_value=lines):r=m.core_records('unused')[0]
  self.assertNotIn('PATIENT CHARACTERISTICS',r['attributes']['businessRules']);self.assertEqual(r['location']['endPage'],70)
 def test_hidden_rows_and_columns(self):
  rows=[{'cells':{}},{'cells':{'C':'DATA ELEMENT NUMBER','K':'Post-Market Business Rule','AG':'Value'}},{'row':3,'hidden':False,'cells':{'C':'C.1.3','D':'Type','H':'Required','J':'-','K':'Postmarket condition','M':'Private premarket condition','N':'Vaccine-specific','AG':'/message/type'}},{'row':4,'hidden':True,'cells':{'C':'FDA.C.1.1','D':'Hidden vaccine field'}}]
  with patch.object(m,'workbook',return_value=[('ICSR Data Elements',rows)]):out,meta=m.fda_records('unused')
  self.assertEqual(len(out),1);self.assertEqual(meta['hiddenRowsExcluded'],1);self.assertNotIn('premarket',out[0]['text']);self.assertNotIn('Vaccine-specific',out[0]['text']);self.assertEqual(out[0]['attributes']['conformance'],'-')
 def test_fail_closed_columns(self):
  with patch.object(m,'workbook',return_value=[('ICSR Data Elements',[{'cells':{}},{'cells':{'C':'Changed'}}])]):
   with self.assertRaises(ValueError):m.fda_records('unused')
if __name__=='__main__':unittest.main()
