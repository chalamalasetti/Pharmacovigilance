-- Free global document library infrastructure. No model API or paid service is enabled.
create table public.pv_jurisdictions(code text primary key check(code ~ '^[A-Z]{2,3}$'),name text not null,region text not null,source text not null);
create table public.pv_agencies(
 id text primary key check(id ~ '^[A-Z0-9][A-Za-z0-9_-]{1,79}$'),country text not null references public.pv_jurisdictions(code),abbr text not null,name text not null,
 official_url text not null,domains text[] not null default '{}',status text not null check(status in ('directory_reference','verified','inactive')),
 reference text not null,verification_note text not null,updated_at timestamptz not null default clock_timestamp(),unique(id,country),
 check(cardinality(domains)<=12),check(status<>'verified' or cardinality(domains)>0)
);
create index pv_agencies_country on public.pv_agencies(country);
alter table public.pv_jurisdictions enable row level security;
alter table public.pv_agencies enable row level security;
create policy "Public jurisdiction directory" on public.pv_jurisdictions for select to anon,authenticated using(true);
create policy "Public agency directory" on public.pv_agencies for select to anon,authenticated using(true);
revoke all on public.pv_jurisdictions,public.pv_agencies from public,anon,authenticated;
grant select on public.pv_jurisdictions,public.pv_agencies to anon,authenticated,service_role;
insert into public.pv_jurisdictions(code,name,region,source) values
('AF','Afghanistan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AX','Åland Islands','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AL','Albania','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('DZ','Algeria','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AS','American Samoa','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AD','Andorra','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AO','Angola','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AI','Anguilla','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AQ','Antarctica','Other','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AG','Antigua and Barbuda','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AR','Argentina','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AM','Armenia','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AW','Aruba','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AU','Australia','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AT','Austria','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AZ','Azerbaijan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BS','Bahamas','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BH','Bahrain','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BD','Bangladesh','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BB','Barbados','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BY','Belarus','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BE','Belgium','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BZ','Belize','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BJ','Benin','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BM','Bermuda','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BT','Bhutan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BO','Bolivia (Plurinational State of)','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BQ','Bonaire, Sint Eustatius and Saba','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BA','Bosnia and Herzegovina','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BW','Botswana','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BV','Bouvet Island','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BR','Brazil','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('IO','British Indian Ocean Territory','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('VG','British Virgin Islands','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BN','Brunei Darussalam','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BG','Bulgaria','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BF','Burkina Faso','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BI','Burundi','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CV','Cabo Verde','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KH','Cambodia','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CM','Cameroon','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CA','Canada','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KY','Cayman Islands','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CF','Central African Republic','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TD','Chad','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CL','Chile','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CN','China','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('HK','China, Hong Kong Special Administrative Region','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MO','China, Macao Special Administrative Region','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CX','Christmas Island','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CC','Cocos (Keeling) Islands','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CO','Colombia','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KM','Comoros','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CG','Congo','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CK','Cook Islands','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CR','Costa Rica','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CI','Côte d’Ivoire','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('HR','Croatia','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CU','Cuba','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CW','Curaçao','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CY','Cyprus','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CZ','Czechia','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KP','Democratic People''s Republic of Korea','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CD','Democratic Republic of the Congo','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('DK','Denmark','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('DJ','Djibouti','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('DM','Dominica','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('DO','Dominican Republic','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('EC','Ecuador','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('EG','Egypt','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SV','El Salvador','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GQ','Equatorial Guinea','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ER','Eritrea','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('EE','Estonia','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SZ','Eswatini','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ET','Ethiopia','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('EU','European Union','Europe','https://www.pvinfo.org/agencies.html'),
('FK','Falkland Islands (Malvinas)','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('FO','Faroe Islands','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('FJ','Fiji','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('FI','Finland','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('FR','France','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GF','French Guiana','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PF','French Polynesia','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TF','French Southern Territories','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GA','Gabon','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GM','Gambia','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GE','Georgia','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('DE','Germany','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GH','Ghana','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GI','Gibraltar','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GR','Greece','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GL','Greenland','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GD','Grenada','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GP','Guadeloupe','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GU','Guam','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GT','Guatemala','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GG','Guernsey','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GN','Guinea','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GW','Guinea-Bissau','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GY','Guyana','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('HT','Haiti','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('HM','Heard Island and McDonald Islands','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('VA','Holy See','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('HN','Honduras','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('HU','Hungary','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('IS','Iceland','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('IN','India','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ID','Indonesia','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('INT','International','International','https://www.pvinfo.org/agencies.html'),
('IR','Iran (Islamic Republic of)','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('IQ','Iraq','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('IE','Ireland','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('IM','Isle of Man','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('IL','Israel','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('IT','Italy','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('JM','Jamaica','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('JP','Japan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('JE','Jersey','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('JO','Jordan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KZ','Kazakhstan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KE','Kenya','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KI','Kiribati','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KW','Kuwait','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KG','Kyrgyzstan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LA','Lao People''s Democratic Republic','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LV','Latvia','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LB','Lebanon','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LS','Lesotho','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LR','Liberia','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LY','Libya','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LI','Liechtenstein','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LT','Lithuania','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LU','Luxembourg','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MG','Madagascar','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MW','Malawi','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MY','Malaysia','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MV','Maldives','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ML','Mali','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MT','Malta','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MH','Marshall Islands','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MQ','Martinique','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MR','Mauritania','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MU','Mauritius','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('YT','Mayotte','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MX','Mexico','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('FM','Micronesia (Federated States of)','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MC','Monaco','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MN','Mongolia','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ME','Montenegro','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MS','Montserrat','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MA','Morocco','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MZ','Mozambique','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MM','Myanmar','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NA','Namibia','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NR','Naoero','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NP','Nepal','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NL','Netherlands (Kingdom of the)','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NC','New Caledonia','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NZ','New Zealand','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NI','Nicaragua','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NE','Niger','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NG','Nigeria','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NU','Niue','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NF','Norfolk Island','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MK','North Macedonia','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MP','Northern Mariana Islands','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('NO','Norway','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('OM','Oman','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PK','Pakistan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PW','Palau','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PA','Panama','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PG','Papua New Guinea','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PY','Paraguay','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PE','Peru','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PH','Philippines','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PN','Pitcairn','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PL','Poland','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PT','Portugal','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PR','Puerto Rico','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('QA','Qatar','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KR','Republic of Korea','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MD','Republic of Moldova','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('RE','Réunion','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('RO','Romania','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('RU','Russian Federation','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('RW','Rwanda','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('BL','Saint Barthélemy','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SH','Saint Helena','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('KN','Saint Kitts and Nevis','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LC','Saint Lucia','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('MF','Saint Martin (French Part)','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PM','Saint Pierre and Miquelon','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('VC','Saint Vincent and the Grenadines','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('WS','Samoa','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SM','San Marino','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ST','Sao Tome and Principe','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SA','Saudi Arabia','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SN','Senegal','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('RS','Serbia','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SC','Seychelles','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SL','Sierra Leone','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SG','Singapore','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SX','Sint Maarten (Dutch part)','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SK','Slovakia','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SI','Slovenia','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SB','Solomon Islands','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SO','Somalia','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ZA','South Africa','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GS','South Georgia and the South Sandwich Islands','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SS','South Sudan','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ES','Spain','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('LK','Sri Lanka','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('PS','State of Palestine','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SD','Sudan','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SR','Suriname','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SJ','Svalbard and Jan Mayen Islands','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SE','Sweden','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('CH','Switzerland','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('SY','Syrian Arab Republic','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TW','Taiwan','Asia-Pacific','https://www.pvinfo.org/agencies.html'),
('TJ','Tajikistan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TH','Thailand','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TL','Timor-Leste','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TG','Togo','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TK','Tokelau','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TO','Tonga','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TT','Trinidad and Tobago','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TN','Tunisia','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TR','Türkiye','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TM','Turkmenistan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TC','Turks and Caicos Islands','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TV','Tuvalu','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('UG','Uganda','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('UA','Ukraine','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('AE','United Arab Emirates','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('GB','United Kingdom of Great Britain and Northern Ireland','Europe','https://unstats.un.org/unsd/methodology/m49/overview/'),
('TZ','United Republic of Tanzania','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('UM','United States Minor Outlying Islands','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('US','United States of America','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('VI','United States Virgin Islands','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('UY','Uruguay','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('UZ','Uzbekistan','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('VU','Vanuatu','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('VE','Venezuela (Bolivarian Republic of)','Americas','https://unstats.un.org/unsd/methodology/m49/overview/'),
('VN','Viet Nam','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('WF','Wallis and Futuna Islands','Oceania','https://unstats.un.org/unsd/methodology/m49/overview/'),
('EH','Western Sahara','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('YE','Yemen','Asia','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ZM','Zambia','Africa','https://unstats.un.org/unsd/methodology/m49/overview/'),
('ZW','Zimbabwe','Africa','https://unstats.un.org/unsd/methodology/m49/overview/');
insert into public.pv_agencies(id,country,abbr,name,official_url,domains,status,reference,verification_note) values
('AE_EDE','AE','EDE','Emirates Drug Establishment / MOHAP','https://mohap.gov.ae/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('AF_NRA','AF','NRA','Afghanistan Food and Drug Authority (AFDA)','https://www.afda.gov.af/en',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('AM_NRA','AM','NRA','Scientific Centre of Drug and Medical Technology Expertise','https://www.pharm.am/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('AO_NRA','AO','NRA','Agencia Reguladora de Medicamentos e Tecnologias de Saude (ARMED)','https://armed.gov.ao/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('AR_ANMAT','AR','ANMAT','Administración Nacional de Medicamentos, Alimentos y Tecnología Médica','https://www.argentina.gob.ar/anmat',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('AT_BASG','AT','BASG','Federal Office for Safety in Health Care (BASG)','https://www.basg.gv.at/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('AU_TGA','AU','TGA','Therapeutic Goods Administration','https://www.tga.gov.au/safety',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BB_NRA','BB','NRA','The Barbados Drug Service, Ministry of Health','https://drugservice.gov.bb/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BD_DGDA','BD','DGDA','Directorate General of Drug Administration','https://dgda.gov.bd/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BE_FAMHP','BE','FAMHP','Federal Agency for Medicines and Health Products','https://www.famhp.be/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BF_NRA','BF','NRA','National Agency for Pharmaceutical Regulation of Burkina Faso (ANRP)','https://anrp.bf/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BG_BDA','BG','BDA','Bulgarian Drug Agency','https://www.bda.bg/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BH_NRA','BH','NRA','National Health Regulatory Authority (NHRA)','https://www.nhra.bh/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BN_NRA','BN','NRA','Department of Pharmaceutical Services, Ministry oh Health','https://moh.gov.bn/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BR_ANVISA','BR','ANVISA','Agência Nacional de Vigilância Sanitária','https://www.gov.br/anvisa',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BT_NRA','BT','NRA','Drug Regulatory Authority, Royal Government of Bhutan','https://www.dra.gov.bt/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BW_NRA','BW','NRA','Botswana Medicines Regulatory Authority (BoMRA)','https://www.bomra.co.bw/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('BY_NRA','BY','NRA','Department of Pharmaceutical Inspection and Organization of Medicines Provision, Ministry of Health of the Republic of Belarus','https://www.rceth.by/en',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CA_HC','CA','HC','Health Canada','https://recalls-rappels.canada.ca/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CD_NRA','CD','NRA','The Directorate of Pharmacy, Medicines and Traditional Medicine (ACOREP)','https://www.acorep.cd/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CF_NRA','CF','NRA','Direction des services Pharmaceutiques des laboratoires et de la Médecine Traditionnelle, Ministère de la Santé publique et de la Population','https://www.sante.gouv.cf/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CH_Swissmedic','CH','Swissmedic','Swissmedic','https://www.swissmedic.ch/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CL_ISP','CL','ISP','Instituto de Salud Pública de Chile','https://www.ispch.cl/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CM_NRA','CM','NRA','Direction de la Pharmacie du Medicament et des Laboratoires (DPML)','https://dpml.cm/index.php/fr/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CN_NMPA','CN','NMPA','National Medical Products Administration','https://english.nmpa.gov.cn/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CO_INVIMA','CO','INVIMA','Instituto Nacional de Vigilancia de Medicamentos y Alimentos','https://www.invima.gov.co/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CR_NRA','CR','NRA','Ministry of Health','https://www.ministeriodesalud.go.cr/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CU_NRA','CU','NRA','Centro para el Control Estatal de la Calidad de los Medicamentos (CECMED)','https://www.cecmed.cu/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CV_NRA','CV','NRA','Entidade Reguladora Independente da Saúde (ERIS), Ministry of Health','https://www.eris.cv/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CY_MOH','CY','MOH','Ministry of Health - Pharmaceutical Services','https://www.moh.gov.cy/phs',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('CZ_SUKL','CZ','SUKL','State Institute for Drug Control','https://www.sukl.cz/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('DE_BfArM','DE','BfArM','Federal Institute for Drugs and Medical Devices','https://www.bfarm.de/EN/Home/_node.html',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('DE_PEI','DE','PEI','Paul Ehrlich Institute','https://www.pei.de/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('DJ_NRA','DJ','NRA','Direction du Médicament, de la Pharmacie et des Laboratoires (DMPL), Ministère de la Santé Publique','https://www.sante.gouv.dj/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('DK_DKMA','DK','DKMA','Danish Medicines Agency','https://laegemiddelstyrelsen.dk/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('DZ_NRA','DZ','NRA','National Agency for Pharmaceutical Products','https://anpp.dz/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('EC_NRA','EC','NRA','Agencia Nacional de Regulación, Control y Vigilancia Sanitaria (ARCSA)','https://www.controlsanitario.gob.ec/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('EE_RAVIMIAMET','EE','RAVIMIAMET','State Agency of Medicines','https://www.ravimiamet.ee/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('EG_EDA','EG','EDA','Egyptian Drug Authority','https://www.edaegypt.gov.eg/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('ES_AEMPS','ES','AEMPS','Agencia Española de Medicamentos y Productos Sanitarios','https://www.aemps.gob.es/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('ET_NRA','ET','NRA','Ethiopian Food and Drug Authority (EFDA)','https://www.efda.gov.et/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('EMA','EU','EMA','European Medicines Agency','https://www.ema.europa.eu/en/human-regulatory-overview/pharmacovigilance-overview',array['www.ema.europa.eu','eur-lex.europa.eu']::text[],'verified','https://www.pvinfo.org/agencies.html','Existing monitored source hosts; document editions and requirements still need separate review.'),
('FI_FIMEA','FI','FIMEA','Finnish Medicines Agency','https://www.fimea.fi/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('FJ_NRA','FJ','NRA','Fiji Medicines Regulatory Authority (Fiji MRA)','https://www.health.gov.fj/fiji-mra',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('FR_ANSM','FR','ANSM','Agence nationale de sécurité du médicament et des produits de santé','https://ansm.sante.fr/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('GA_NRA','GA','NRA','Gabon Medicines Agency','https://www.amgabon.ga/index.php',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('GB_MHRA','GB','MHRA','Medicines and Healthcare products Regulatory Agency','https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('GH_FDAGhana','GH','FDA Ghana','Food and Drugs Authority Ghana','https://fdaghana.gov.gh/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('GR_EOF','GR','EOF','National Organization for Medicines','https://www.eof.gr/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('GT_NRA','GT','NRA','Departamento de Regulación y Control de Productos Farmacéuticos y Afines (DRCPFA)','https://medicamentos.mspas.gob.gt/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('HK_DHDrugOffice','HK','DH Drug Office','Department of Health Drug Office','https://www.drugoffice.gov.hk/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('HR_HALMED','HR','HALMED','Agency for medicinal products and medical devices of Croatia','https://www.halmed.hr/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('HU_NNK','HU','NNK','National Centre for Public Health and Pharmacy','https://www.nnk.gov.hu/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('ID_BPOM','ID','BPOM','Badan Pengawas Obat dan Makanan','https://www.pom.go.id/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('IE_HPRA','IE','HPRA','Health Products Regulatory Authority','https://www.hpra.ie/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('IL_MoHIsrael','IL','MoH Israel','Israel Ministry of Health, Pharmaceutical Division','https://www.gov.il/en/departments/ministry_of_health',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('IN_CDSCO','IN','CDSCO','Central Drugs Standard Control Organisation / PvPI','https://cdsco.gov.in/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('INT_AMA','INT','AMA','African Medicines Agency','https://www.nepad.org/microsite/african-medicines-agency-ama',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('INT_CIOMS','INT','CIOMS','Council for International Organizations of Medical Sciences','https://cioms.ch/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('INT_ICMRA','INT','ICMRA','International Coalition of Medicines Regulatory Authorities','https://www.icmra.info/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('INT_ICH','INT','ICH','International Council for Harmonisation','https://www.ich.org/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('INT_UMC','INT','UMC','Uppsala Monitoring Centre (WHO Programme for International Drug Monitoring)','https://who-umc.org/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('INT_WHO','INT','WHO','World Health Organization','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/pharmacovigilance',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('IR_NRA','IR','NRA','Food and Drug Administration','https://fda.gov.ir/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('IS_IMCA','IS','IMCA','Icelandic Medicines Agency','https://www.imca.is/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('IT_AIFA','IT','AIFA','Agenzia Italiana del Farmaco','https://www.aifa.gov.it/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('JO_NRA','JO','NRA','Jordan Food and Drug Administration (JFDA)','https://www.jfda.jo/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('JP_PMDA','JP','PMDA','Pharmaceuticals and Medical Devices Agency / MHLW','https://www.pmda.go.jp/english/safety/info-services/drugs/0001.html',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('KE_PPB','KE','PPB','Pharmacy and Poisons Board','https://web.pharmacyboardkenya.org/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('KH_NRA','KH','NRA','Department of Drugs and food, Ministry of Health','https://ddf.moh.gov.kh/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('KR_MFDS','KR','MFDS','Ministry of Food and Drug Safety','https://www.mfds.go.kr/eng/index.do',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('LI_LLV','LI','LLV','Office of Health / Department of Pharmaceuticals','https://www.llv.li/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('LK_NRA','LK','NRA','National Medicines Regulatory Authority (NMRA)','https://www.nmra.gov.lk/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('LR_NRA','LR','NRA','The Liberia Medicines & Health Products Regulatory Authority (LMHRA)','https://www.lmhra.gov.lr/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('LS_NRA','LS','NRA','Lesotho Medicines and Medical Devices Control Authority, Ministry of Health','https://health.gov.ls/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('LT_VVKT','LT','VVKT','State Medicines Control Agency','https://vvkt.lrv.lt/lt/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('LU_SANTE','LU','SANTE','Ministry of Health and Social Security','https://sante.public.lu/fr.html',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('LV_ZVA','LV','ZVA','State Agency of Medicines','https://www.zva.gov.lv/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('MM_NRA','MM','NRA','Department of Food and Drug Administration, Ministry of Health and Sports','https://www.fda.gov.mm/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('MT_MMA','MT','MMA','Malta Medicines Authority (MMA)','https://www.medicinesauthority.gov.mt/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('MU_NRA','MU','NRA','Pharmaceutical Services, Ministry of Health and Wellness','https://health.govmu.org/health/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('MV_NRA','MV','NRA','Maldives Food and Drug Authority (MFDA), Ministry of Health','https://health.gov.mv/en/departments/maldives-food-and-drug-authority',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('MW_NRA','MW','NRA','Pharmacy and Medicines Regulatory Authority (PMRA)','https://www.pmra.mw/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('MX_COFEPRIS','MX','COFEPRIS','Comisión Federal para la Protección contra Riesgos Sanitarios','https://www.gob.mx/cofepris',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('MY_NPRA','MY','NPRA','National Pharmaceutical Regulatory Agency','https://www.npra.gov.my/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('MZ_NRA','MZ','NRA','National Medicines Regulatory Authority (ANARME, IP)','https://anarme.gov.mz/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('NA_NRA','NA','NRA','Namibian Medicines regulatory council, Ministry of Health and Social Services','https://nmrc.gov.na/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('NG_NAFDAC','NG','NAFDAC','National Agency for Food and Drug Administration and Control','https://nafdac.gov.ng/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('NL_ENGLISH','NL','ENGLISH','Central Committee on Research Involving Human Subjects','https://english.ccmo.nl/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('NL_IGZ','NL','IGZ','Healthcare and Youth Care Inspectorate, Ministry of Health, Welfare and Sport','https://www.igz.nl/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('NL_CBGMEB','NL','CBG-MEB','Medicines Evaluation Board / Lareb','https://www.cbg-meb.nl/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('NO_DMP','NO','DMP','Norwegian Medical Products Agency','https://www.dmp.no/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('NZ_Medsafe','NZ','Medsafe','Medsafe (New Zealand Medicines and Medical Devices Safety Authority)','https://www.medsafe.govt.nz/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('OM_NRA','OM','NRA','Directorate General of Medical Supplies (DGMS)','https://www.moh.gov.om/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('PE_DIGEMID','PE','DIGEMID','Dirección General de Medicamentos, Insumos y Drogas','https://www.digemid.minsa.gob.pe/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('PG_NRA','PG','NRA','Ministry of Health, National Department of Health','https://www.health.gov.pg/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('PH_FDAPH','PH','FDA PH','Food and Drug Administration Philippines','https://www.fda.gov.ph/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('PK_DRAP','PK','DRAP','Drug Regulatory Authority of Pakistan','https://www.dra.gov.pk/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('PL_GIF','PL','GIF','Chief Pharmaceutical Inspectorate','https://www.gif.gov.pl/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('PL_URPL','PL','URPL','Office for Registration of Medicinal Products','https://urpl.gov.pl/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('PT_EXTRANET','PT','EXTRANET','National Authority of Medicines and Health Products','https://extranet.infarmed.pt/INFOMED-fo/index.xhtml',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('PY_NRA','PY','NRA','Direccion de Viglancia Sanitaria del Ministerio de Salud Publica y Bienestar Social (MSPBS)','https://www.mspbs.gov.py/registros-sanitarios-vigentes.html',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('QA_NRA','QA','NRA','Pharmacy and Drug Control Department Ministry of Public Health','https://www.moph.gov.qa/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('RO_ANM','RO','ANM','National Authority of Medicines and Medical Devices of Romania','https://www.anm.ro/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('RU_Roszdravnadzor','RU','Roszdravnadzor','Federal Service for Surveillance in Healthcare','https://roszdravnadzor.gov.ru/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('RW_NRA','RW','NRA','Rwanda Food and Drugs Authority (Rwanda FDA)','https://rwandafda.gov.rw/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SA_SFDA','SA','SFDA','Saudi Food and Drug Authority','https://www.sfda.gov.sa/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SC_NRA','SC','NRA','Pharmaceutical Services, Ministry of Health','https://www.health.gov.sc/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SD_NRA','SD','NRA','National Medicines and Poisons Board (NMPB)','https://www.nmpb.gov.sd/en/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SE_MPA','SE','MPA','Läkemedelsverket (Medical Products Agency)','https://www.lakemedelsverket.se/en',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SG_HSA','SG','HSA','Health Sciences Authority','https://www.hsa.gov.sg/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SI_JAZMP','SI','JAZMP','Agency for Medicinal Products and Medical Devices of the Republic of Slovenia','https://www.jazmp.si/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SK_SUKL','SK','SUKL','State Institute for Drug Control','https://www.sukl.sk/',array[]::text[],'directory_reference','https://www.ema.europa.eu/en/partners-networks/eu-partners/eu-member-states/national-competent-authorities-human','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SL_NRA','SL','NRA','Pharmacy Board of Sierra Leone','https://www.pharmacyboard.gov.sl/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SO_NRA','SO','NRA','Pharmaceuticals Regulation Section, Ministry of Health','https://www.moh.gov.so/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('SR_NRA','SR','NRA','Ministry of Health','https://www.gov.sr/ministeries/ministerie-van-volksgezondheid',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('TH_ThaiFDA','TH','Thai FDA','Thai Food and Drug Administration','https://en.fda.moph.go.th/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('TR_TITCK','TR','TITCK','Turkish Medicines and Medical Devices Agency','https://www.titck.gov.tr/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('TT_NRA','TT','NRA','Chemistry, Food and Drugs Division of the Ministry of Health','https://www.health.gov.tt/services/chemistry-food-and-drugs-division',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('TW_TFDA','TW','TFDA','Taiwan Food and Drug Administration','https://www.fda.gov.tw/ENG',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('TZ_NRA','TZ','NRA','Tanzania Medicines and Medical Devices Authority (TMDA)','https://www.tmda.go.tz/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('UA_NRA','UA','NRA','State Service of Ukraine on Medicines and Drugs Control (SMDC)','https://www.dls.gov.ua/en/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('FDA','US','FDA','U.S. Food and Drug Administration','https://www.fda.gov/drugs/drug-safety-and-availability',array['www.fda.gov','www.ecfr.gov']::text[],'verified','https://www.pvinfo.org/agencies.html','Existing monitored source hosts; document editions and requirements still need separate review.'),
('VN_DAV','VN','DAV','Drug Administration of Vietnam','https://dav.gov.vn/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('ZA_SAHPRA','ZA','SAHPRA','South African Health Products Regulatory Authority','https://www.sahpra.org.za/',array[]::text[],'directory_reference','https://www.pvinfo.org/agencies.html','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('ZM_NRA','ZM','NRA','Zambia Medicines Regulatory Authority (ZAMRA)','https://www.zamra.co.zm/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.'),
('ZW_NRA','ZW','NRA','Medicines Control Authority of Zimbabwe','https://www.mcaz.co.zw/',array[]::text[],'directory_reference','https://www.who.int/teams/regulation-prequalification/regulation-and-safety/regulatory-convergence-networks/certification-scheme/contacts','Directory reference only. Verify the current PV mandate, website and exact HTTPS hosts before enabling capture.');
alter table public.pv_documents drop constraint pv_documents_country_check,drop constraint pv_documents_agency_check,drop constraint pv_documents_check;
alter table public.pv_documents add constraint pv_documents_authority foreign key(agency,country) references public.pv_agencies(id,country);
create index pv_documents_authority on public.pv_documents(agency,country);
create or replace function public.pv_official_document_url(v text,agency text) returns void
language plpgsql stable set search_path='' as $$
begin
 perform public.company_case_url(v);
 if v !~ '^https://[^/@:?#]+/' or not exists(select 1 from public.pv_agencies a where a.id=agency and a.status='verified' and split_part(split_part(v,'https://',2),'/',1)=any(a.domains)) then raise exception 'Use an approved official HTTPS host for this agency';end if;
end $$;
revoke all on function public.pv_official_document_url(text,text) from public,anon,authenticated;
create or replace function public.admin_save_pv_agency(p_data jsonb,p_expected timestamptz default null) returns public.pv_agencies
language plpgsql security definer set search_path='' as $$
declare a public.pv_agencies;k text;host text;hosts text[];old public.pv_agencies;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or (select count(*) from jsonb_object_keys(p_data))<>9 then raise exception 'Use documented agency fields';end if;
 foreach k in array array['id','country','abbr','name','official_url','status','reference','verification_note'] loop
  if jsonb_typeof(p_data->k) is distinct from 'string' then raise exception 'Invalid agency field';end if;
 end loop;
 if p_data->>'id' !~ '^[A-Z0-9][A-Za-z0-9_-]{1,79}$' or not exists(select 1 from public.pv_jurisdictions where code=p_data->>'country') or p_data->>'status' not in ('directory_reference','verified','inactive') then raise exception 'Invalid agency identity or state';end if;
 perform public.pv_organizational_text(p_data->>'abbr','Agency abbreviation',40);
 perform public.pv_organizational_text(p_data->>'name','Organization name',240);
 perform public.pv_organizational_text(p_data->>'verification_note','Verification rationale',1000);
 perform public.company_case_url(p_data->>'official_url');perform public.company_case_url(p_data->>'reference');
 if p_data->>'official_url' !~ '^https://' or p_data->>'reference' !~ '^https://' then raise exception 'HTTPS URLs required';end if;
 if jsonb_typeof(p_data->'domains') is distinct from 'array' or jsonb_array_length(p_data->'domains')>12 or exists(select 1 from jsonb_array_elements(p_data->'domains') d where jsonb_typeof(d)<>'string') then raise exception 'Invalid approved host list';end if;
 hosts:=array(select distinct jsonb_array_elements_text(p_data->'domains'));
 foreach host in array hosts loop
  if length(host)>253 or host !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$' or host ~ '(\.(local|localhost|internal|invalid|test|example))$' then raise exception 'Use exact public HTTPS hostnames without wildcards, ports or paths';end if;
 end loop;
 if p_data->>'status'='verified' and (cardinality(hosts)=0 or split_part(split_part(p_data->>'official_url','https://',2),'/',1)<>all(hosts)) then raise exception 'Include the official website hostname in the approved hosts';end if;
 perform pg_advisory_xact_lock(hashtextextended('agency:'||(p_data->>'id'),0));
 select * into old from public.pv_agencies where id=p_data->>'id' for update;
 if old.updated_at is distinct from p_expected then raise exception 'Agency directory changed. Reload before saving';end if;
 if old.id is not null and old.country<>p_data->>'country' then raise exception 'Keep the agency jurisdiction stable; register a separate authority';end if;
 insert into public.pv_agencies(id,country,abbr,name,official_url,domains,status,reference,verification_note)
 values(p_data->>'id',p_data->>'country',p_data->>'abbr',p_data->>'name',p_data->>'official_url',hosts,p_data->>'status',p_data->>'reference',p_data->>'verification_note')
 on conflict(id)do update set abbr=excluded.abbr,name=excluded.name,official_url=excluded.official_url,domains=excluded.domains,status=excluded.status,reference=excluded.reference,verification_note=excluded.verification_note,updated_at=clock_timestamp() returning * into a;
 perform public.admin_log('agency directory configured',a.id,jsonb_build_object('note',a.verification_note,'status',a.status));return a;
end $$;
revoke all on function public.admin_save_pv_agency(jsonb,timestamptz) from public,anon;
grant execute on function public.admin_save_pv_agency(jsonb,timestamptz) to authenticated;
create or replace function public.admin_save_pv_document(p_data jsonb,p_expected timestamptz default null) returns public.pv_documents
language plpgsql security definer set search_path='' as $$
declare d public.pv_documents;k text;limit_n integer;old_at timestamptz;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or (select count(*) from jsonb_object_keys(p_data))<>16 then raise exception 'Use the documented source fields';end if;
 foreach k in array array['id','title','country','agency','url','edition','topic','lifecycle','norm','legal_basis','applicability','source_status','published_on','effective_on','status','capture_note'] loop
  if jsonb_typeof(p_data->k) is distinct from 'string' then raise exception 'Invalid source field: %',k;end if;
 end loop;
 if p_data->>'id' !~ '^[a-z0-9][a-z0-9-]{2,79}$' then raise exception 'Invalid stable document ID';end if;
 if not exists(select 1 from public.pv_agencies a where a.id=p_data->>'agency' and a.country=p_data->>'country' and a.status='verified') then raise exception 'Unsupported country and agency pair';end if;
 if p_data->>'lifecycle' not in ('Clinical','Marketed','Both') or p_data->>'norm' not in ('Regulation','Guidance','Technical instruction') or p_data->>'source_status' not in ('current','draft','superseded','withdrawn','uncertain') or p_data->>'status' not in ('active','inactive') then raise exception 'Invalid document classification';end if;
 foreach k in array array['title','edition','topic','legal_basis','applicability','capture_note'] loop
  limit_n:=case k when 'title' then 240 when 'edition' then 100 when 'topic' then 80 when 'legal_basis' then 600 else 1000 end;
  perform public.pv_organizational_text(p_data->>k,k,limit_n);
 end loop;
 perform public.pv_official_document_url(p_data->>'url',p_data->>'agency');
 foreach k in array array['published_on','effective_on'] loop
  if p_data->>k<>'' and (p_data->>k !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p_data->>k)::date,'YYYY-MM-DD')<>p_data->>k) then raise exception 'Invalid source date';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('document:'||(p_data->>'id'),0));
 select updated_at into old_at from public.pv_documents where id=p_data->>'id' for update;
 if old_at is distinct from p_expected then raise exception 'Document configuration changed. Reload before saving';end if;
 -- Country/agency identity is stable. Register a separate family for a different authority.
 if exists(select 1 from public.pv_documents where id=p_data->>'id' and (country<>p_data->>'country' or agency<>p_data->>'agency')) then raise exception 'Do not change an existing document authority';end if;
 insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,published_on,effective_on,status)
 values(p_data->>'id',p_data->>'title',p_data->>'country',p_data->>'agency',p_data->>'url',p_data->>'edition',p_data->>'topic',p_data->>'lifecycle',p_data->>'norm',p_data->>'legal_basis',p_data->>'applicability',p_data->>'source_status',nullif(p_data->>'published_on','')::date,nullif(p_data->>'effective_on','')::date,p_data->>'status')
 on conflict(id) do update set title=excluded.title,url=excluded.url,edition=excluded.edition,topic=excluded.topic,lifecycle=excluded.lifecycle,norm=excluded.norm,legal_basis=excluded.legal_basis,applicability=excluded.applicability,source_status=excluded.source_status,published_on=excluded.published_on,effective_on=excluded.effective_on,status=excluded.status,updated_at=clock_timestamp() returning * into d;
 perform public.admin_log('document source configured',d.id,jsonb_build_object('note',p_data->>'capture_note','status',d.status));return d;
end $$;
revoke all on function public.admin_save_pv_document(jsonb,timestamptz) from public,anon;
grant execute on function public.admin_save_pv_document(jsonb,timestamptz) to authenticated;

create or replace function public.validate_requirement_body(b jsonb) returns void
language plpgsql stable set search_path='' as $$
declare k text; lim integer; d text;
begin
 if b is null or jsonb_typeof(b)<>'object' then raise exception 'Requirement fields required';end if;
 if jsonb_typeof(b->'title') is distinct from 'string' or length(b->>'title')>160 then raise exception 'Invalid title';end if;
 if jsonb_typeof(b->'statement') is distinct from 'string' or length(b->>'statement')>1800 then raise exception 'Invalid statement';end if;
 if jsonb_typeof(b->'agency') is distinct from 'string' or length(b->>'agency')>80 then raise exception 'Invalid agency';end if;
 if jsonb_typeof(b->'topic') is distinct from 'string' or length(b->>'topic')>80 then raise exception 'Invalid topic';end if;
 if jsonb_typeof(b->'lifecycle') is distinct from 'string' or length(b->>'lifecycle')>30 then raise exception 'Invalid lifecycle';end if;
 if jsonb_typeof(b->'norm') is distinct from 'string' or length(b->>'norm')>30 then raise exception 'Invalid norm';end if;
 if jsonb_typeof(b->'source_title') is distinct from 'string' or length(b->>'source_title')>240 then raise exception 'Invalid source_title';end if;
 if jsonb_typeof(b->'source_family') is distinct from 'string' or length(b->>'source_family')>100 then raise exception 'Invalid source_family';end if;
 if jsonb_typeof(b->'source_edition') is distinct from 'string' or length(b->>'source_edition')>100 then raise exception 'Invalid source_edition';end if;
 if jsonb_typeof(b->'source_url') is distinct from 'string' or length(b->>'source_url')>1500 then raise exception 'Invalid source_url';end if;
 if jsonb_typeof(b->'clause') is distinct from 'string' or length(b->>'clause')>200 then raise exception 'Invalid clause';end if;
 if jsonb_typeof(b->'legal_basis') is distinct from 'string' or length(b->>'legal_basis')>600 then raise exception 'Invalid legal_basis';end if;
 if jsonb_typeof(b->'applicability') is distinct from 'string' or length(b->>'applicability')>1000 then raise exception 'Invalid applicability';end if;
 if jsonb_typeof(b->'exceptions') is distinct from 'string' or length(b->>'exceptions')>1000 then raise exception 'Invalid exceptions';end if;
 if jsonb_typeof(b->'systems') is distinct from 'string' or length(b->>'systems')>500 then raise exception 'Invalid systems';end if;
 if jsonb_typeof(b->'processes') is distinct from 'string' or length(b->>'processes')>500 then raise exception 'Invalid processes';end if;
 if jsonb_typeof(b->'valid_from') is distinct from 'string' or length(b->>'valid_from')>10 then raise exception 'Invalid valid_from';end if;
 if jsonb_typeof(b->'valid_to') is distinct from 'string' or length(b->>'valid_to')>10 then raise exception 'Invalid valid_to';end if;
 if jsonb_typeof(b->'published_on') is distinct from 'string' or length(b->>'published_on')>10 then raise exception 'Invalid published_on';end if;
 if jsonb_typeof(b->'source_status') is distinct from 'string' or length(b->>'source_status')>20 then raise exception 'Invalid source_status';end if;
 if jsonb_typeof(b->'change_kind') is distinct from 'string' or length(b->>'change_kind')>40 then raise exception 'Invalid change_kind';end if;
 if jsonb_typeof(b->'change_summary') is distinct from 'string' or length(b->>'change_summary')>1000 then raise exception 'Invalid change_summary';end if;
 if jsonb_typeof(b->'predecessor_note') is distinct from 'string' or length(b->>'predecessor_note')>600 then raise exception 'Invalid predecessor_note';end if;
 if (select count(*) from jsonb_object_keys(b))<>23 then raise exception 'Unknown requirement field';end if;
 perform public.company_case_text(b->>'title','title',160);
 perform public.company_case_text(b->>'statement','statement',1800);
 perform public.company_case_text(b->>'source_title','source_title',240);
 perform public.company_case_text(b->>'source_family','source_family',100);
 perform public.company_case_text(b->>'source_edition','source_edition',100);
 perform public.company_case_text(b->>'clause','clause',200);
 perform public.company_case_text(b->>'legal_basis','legal_basis',600);
 perform public.company_case_text(b->>'applicability','applicability',1000);
 perform public.company_case_text(b->>'exceptions','exceptions',1000);
 perform public.company_case_text(b->>'change_summary','change_summary',1000);
 perform public.company_case_text(b->>'predecessor_note','predecessor_note',600);
 if not exists(select 1 from public.pv_agencies where id=b->>'agency' and status='verified') or b->>'lifecycle' not in ('Clinical','Marketed','Both') or b->>'norm' not in ('Regulation','Guidance','Technical instruction') or b->>'source_status' not in ('current','draft','superseded','withdrawn','uncertain') or b->>'change_kind' not in ('Baseline capture','New obligation','Scope change','Deadline change','Technical change','Clarification','Removal','Editorial change','Unclassified') then raise exception 'Invalid classification';end if;
 perform public.company_case_text(b->>'topic','Topic',80);
 if b->>'systems'<>'' then perform public.company_case_text(b->>'systems','Systems',500);end if;
 if b->>'processes'<>'' then perform public.company_case_text(b->>'processes','Processes',500);end if;
 if b::text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\+[0-9][0-9 ().-]{7,}[0-9]|\m(phone|fax|dob|date of birth)\s*[:=]' then raise exception 'Remove public contact details and personal data';end if;
 perform public.company_case_url(b->>'source_url');
 perform public.pv_official_document_url(b->>'source_url',b->>'agency');
 if exists(select 1 from public.pv_documents where id=b->>'source_family' and agency<>b->>'agency') then raise exception 'Keep the document agency pinned';end if;
 foreach k in array array['valid_from','valid_to','published_on'] loop
  d:=b->>k;
  if d<>'' and (d !~ '^\d{4}-\d{2}-\d{2}$' or to_char(d::date,'YYYY-MM-DD')<>d) then raise exception 'Invalid date';end if;
 end loop;
 if b->>'valid_to'<>'' and (b->>'valid_from'='' or b->>'valid_to'<=b->>'valid_from') then raise exception 'Invalid validity interval';end if;
end $$;
revoke all on function public.validate_requirement_body(jsonb) from public,anon,authenticated;

-- A bounded, oldest-check-first queue avoids a first-100 starvation cliff as the library grows.
create view public.pv_document_schedule with(security_invoker=true) as
 select d.*,c.checked_at,exists(select 1 from public.pv_document_versions v where v.document_id=d.id and v.content_kind<>'metadata') as has_capture
 from public.pv_documents d join public.pv_agencies a on a.id=d.agency and a.status='verified'
 left join public.pv_document_checks c on c.document_id=d.id where d.status='active';
revoke all on public.pv_document_schedule from public,anon,authenticated;
grant select on public.pv_document_schedule to anon,authenticated,service_role;
