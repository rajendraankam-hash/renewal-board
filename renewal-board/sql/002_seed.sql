-- Renewal & Lead Follow-Up Board - realistic demo data
-- Run once, after 001_schema.sql. Safe to re-run: it clears the table first.
-- Dates are relative to today, so the board always has overdue, due-today and upcoming rows.

truncate table public.records;

insert into public.records
  (record_type, customer_name, product, due_date, next_contact_date, handler,
   amount_at_risk_paise, status, last_activity_at, last_activity_type, activity_count)
values
  -- Policy renewals (amounts in paise: Rs 46,500 = 4650000)
  ('policy_renewal', 'Kamat Traders',            'Health Insurance',      current_date - 8,  null, 'Rohit Deshmukh',  4650000, 'open',      null,   null,    0),
  ('policy_renewal', 'Shree Ganesh Enterprises', 'Motor Insurance',       current_date - 2,  null, 'Rohit Deshmukh',  1890000, 'open',      null,   null,    0),
  ('policy_renewal', 'Maruti Logistics',         'Motor Insurance',       current_date,      null, 'Sneha Kulkarni',  2240000, 'open',      null,   null,    0),
  ('policy_renewal', 'Sai Medical Stores',       'Health Insurance',      current_date + 4,  null, 'Sneha Kulkarni',  6320000, 'open',      null,   null,    0),
  ('policy_renewal', 'Dombivli Textiles',        'Shopkeeper Insurance',  current_date + 12, null, 'Imran Shaikh',     980000, 'open',      null,   null,    0),
  ('policy_renewal', 'Riddhi Siddhi Caterers',   'Health Insurance',      current_date + 3,  null, 'Imran Shaikh',    2875000, 'open',      null,   null,    0),
  ('policy_renewal', 'Vasai Roadways',           'Motor Insurance',       current_date - 15, null, 'Priya Nair',      1630000, 'open',      null,   null,    0),
  ('policy_renewal', 'Thane Steel Works',        'Term Life',             current_date + 21, null, 'Priya Nair',      3760000, 'open',      null,   null,    0),
  ('policy_renewal', 'Nerul Diagnostics',        'Health Insurance',      current_date,      null, 'Amit Jadhav',     5490000, 'contacted', now(),  'call',  1),
  ('policy_renewal', 'Borivali Fresh Mart',      'Shopkeeper Insurance',  current_date - 5,  null, 'Amit Jadhav',      840000, 'open',      null,   null,    0),
  ('policy_renewal', 'Kalyan Auto Spares',       'Motor Insurance',       current_date + 9,  null, 'Farhan Qureshi',  1270000, 'open',      null,   null,    0),
  ('policy_renewal', 'CBD Belapur Consulting',   'Term Life',             current_date + 30, null, 'Farhan Qureshi',  4120000, 'open',      null,   null,    0),

  -- Loan files
  ('loan_file',      'Vikhroli Fabricators',     'Business Loan',         current_date - 4,  null, 'Rohit Deshmukh', 18500000, 'open',      null,   null,    0),
  ('loan_file',      'Panvel Hardware',          'Personal Loan',         current_date + 6,  null, 'Rohit Deshmukh',  4250000, 'open',      null,   null,    0),
  ('loan_file',      'Mulund Interiors',         'Home Loan',             current_date + 18, null, 'Sneha Kulkarni', 52000000, 'open',      null,   null,    0),
  ('loan_file',      'Airoli Softworks',         'Business Loan',         current_date,      null, 'Sneha Kulkarni', 24000000, 'contacted', now(),  'visit', 1),
  ('loan_file',      'Ghatkopar Motors',         'Loan Against Property', current_date - 11, null, 'Imran Shaikh',   35000000, 'open',      null,   null,    0),
  ('loan_file',      'Chembur Printers',         'Personal Loan',         current_date + 2,  null, 'Imran Shaikh',    6800000, 'open',      null,   null,    0),
  ('loan_file',      'Dadar Apparel',            'Business Loan',         current_date + 14, null, 'Priya Nair',     12750000, 'open',      null,   null,    0),
  ('loan_file',      'Bandra Cafe Co.',          'Personal Loan',         current_date - 1,  null, 'Priya Nair',      3500000, 'open',      null,   null,    0),
  ('loan_file',      'Andheri Fitness',          'Business Loan',         current_date + 25, null, 'Amit Jadhav',     9600000, 'open',      null,   null,    0),
  ('loan_file',      'Kurla Cold Storage',       'Loan Against Property', current_date + 7,  null, 'Farhan Qureshi', 28500000, 'open',      null,   null,    0),

  -- Cold leads (no real deadline, so next_contact_date is used; amount may be unknown = null)
  ('cold_lead',      'Pune Link Realty',         'Health Insurance',      null, current_date - 2,  'Rohit Deshmukh',  null,      'open',      null,   null,    0),
  ('cold_lead',      'Navi Mumbai Packers',      'Business Loan',         null, current_date,      'Sneha Kulkarni',  5000000,   'open',      null,   null,    0),
  ('cold_lead',      'Badlapur Agro',            'Shopkeeper Insurance',  null, current_date + 3,  'Imran Shaikh',    null,      'open',      null,   null,    0),
  ('cold_lead',      'Mira Road Pharmacy',       'Health Insurance',      null, current_date - 6,  'Priya Nair',      null,      'contacted', now(),  'call',  1),
  ('cold_lead',      'Ambernath Engineering',    'Business Loan',         null, current_date + 5,  'Amit Jadhav',     15000000,  'open',      null,   null,    0),
  ('cold_lead',      'Palghar Solar',            'Loan Against Property', null, current_date + 10, 'Farhan Qureshi',  null,      'open',      null,   null,    0),
  ('cold_lead',      'Bhiwandi Warehousing',     'Business Loan',         null, current_date,      'Rohit Deshmukh',  22000000,  'open',      null,   null,    0),
  ('cold_lead',      'Uran Fishing Co-op',       'Shopkeeper Insurance',  null, current_date + 1,  'Sneha Kulkarni',  null,      'open',      null,   null,    0);
