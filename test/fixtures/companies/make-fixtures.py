"""Writes the synthetic Company Explorer fixtures: orangebook.zip (Orange Book layout) and
ema.xlsx (EMA medicines report layout). The medicines are invented; only the company
names are real, so the identity rules can be tested.

    python3 test/fixtures/companies/make-fixtures.py test/fixtures/companies
"""
import zipfile, sys, os
out = sys.argv[1]
ob = """Ingredient~DF;Route~Trade_Name~Applicant~Strength~Appl_Type~Appl_No~Product_No~TE_Code~Approval_Date~RLD~RS~Type~Applicant_Full_Name
FICTIVASTATIN CALCIUM~TABLET;ORAL~SYNTHEX~MERCK SHARP DOHME~EQ 10MG BASE~N~099001~001~AB~Jan 5, 2001~Yes~No~RX~MERCK SHARP AND DOHME LLC
FICTIVASTATIN CALCIUM~TABLET;ORAL~SYNTHEX~MERCK SHARP DOHME~EQ 20MG BASE~N~099001~002~AB~Mar 2, 2003~Yes~Yes~RX~MERCK SHARP AND DOHME LLC
FICTIVASTATIN CALCIUM~TABLET;ORAL~FICTIVASTATIN CALCIUM~TEVA PHARMS USA~EQ 10MG BASE~A~099002~001~AB~Jun 1, 2015~No~No~RX~TEVA PHARMACEUTICALS USA INC
ALPHAMYCIN HYDROCHLORIDE~CAPSULE;ORAL~SAMEBRAND~PFIZER~250MG~N~099003~001~~Approved Prior to Jan 1, 1982~Yes~No~DISCN~PFIZER LABORATORIES DIV PFIZER INC
OXYDEMOCAINE; PLACEBOTHIAZIDE~TABLET;ORAL~DUOFICT~ACME GENERICS~10MG;12.5MG~A~099004~001~AB~Feb 3, 2010~No~No~RX~ACME GENERICS LLC
SEMAGLUTIDE~TABLET;ORAL~EXEMPLIC ORAL~NOVO~3MG~N~099005~001~~Sep 20, 2019~Yes~Yes~RX~NOVO NORDISK INC
"""
with zipfile.ZipFile(os.path.join(out, "orangebook.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("products.txt", ob.replace("\n", "\r\n"))
    z.writestr("patent.txt", "Appl_Type~Appl_No\r\n")

rows = [
  ["Synthetic test fixture: invented medicines, not real EMA data"],
  [],
  ["Category","Name of medicine","EMA product number","Medicine status","International non-proprietary name (INN) / common name","Active substance","ATC code (human)","Pharmacotherapeutic group (human)","Generic or hybrid","Biosimilar","Marketing authorisation developer / applicant / holder","Marketing authorisation date","Medicine URL"],
  ["Human","Mockerbitux","EMEA/H/C/099101","Authorised","mockuximab","Mockuximab","L01FE99","Antineoplastic agents","no","no","Merck Europe B.V.","44927","https://www.ema.europa.eu/en/medicines/human/EPAR/mockerbitux"],
  ["Human","Samebrand","EMEA/H/C/099102","Authorised","betamycin","Betamycin sodium","J01XX99","Antibacterials for systemic use","no","no","Sanofi Winthrop Industrie","15/03/2012","https://www.ema.europa.eu/en/medicines/human/EPAR/samebrand"],
  ["Human","Exemplic","EMEA/H/C/099103","Authorised","semaglutide","Semaglutide","A10BJ06","Drugs used in diabetes","no","no","Novo Nordisk A/S","43000","https://www.ema.europa.eu/en/medicines/human/EPAR/exemplic"],
  ["Human","Synthex EU","EMEA/H/C/099104","Withdrawn","fictivastatin","Fictivastatin calcium","C10AA99","Lipid modifying agents","no","no","Merck Sharp & Dohme B.V.","38000","https://www.ema.europa.eu/en/medicines/human/EPAR/synthex-eu"],
  ["Human","Refusedia","EMEA/H/C/099105","Refused","refusamab","Refusamab","","","no","no","Pfizer Europe MA EEIG","",""],
  ["Veterinary","Petfict","EMEA/V/C/099106","Authorised","petmycin","Petmycin","","","no","no","Bayer Animal Health GmbH","",""],
]
strings = []
def si(s):
    if s not in strings: strings.append(s)
    return strings.index(s)
def col(i):
    s=""; i+=1
    while i: i,r=divmod(i-1,26); s=chr(65+r)+s
    return s
from xml.sax.saxutils import escape
sheet = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
for ri,row in enumerate(rows,1):
    sheet.append(f'<row r="{ri}">')
    for ci,v in enumerate(row):
        ref=f"{col(ci)}{ri}"
        if v=="": continue
        if v.isdigit() and ci==11: sheet.append(f'<c r="{ref}"><v>{v}</v></c>')
        else: sheet.append(f'<c r="{ref}" t="s"><v>{si(v)}</v></c>')
    sheet.append('</row>')
sheet.append('</sheetData></worksheet>')
sst = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + "".join(f"<si><t>{escape(s)}</t></si>" for s in strings) + "</sst>"
wb = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Medicines" sheetId="1" r:id="rId1"/></sheets></workbook>'
rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'
with zipfile.ZipFile(os.path.join(out, "ema.xlsx"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", ct)
    z.writestr("xl/workbook.xml", wb)
    z.writestr("xl/_rels/workbook.xml.rels", rels)
    z.writestr("xl/worksheets/sheet1.xml", "".join(sheet))
    z.writestr("xl/sharedStrings.xml", sst)
