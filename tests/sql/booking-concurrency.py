import subprocess,time,uuid,os,shlex
PSQL = shlex.split(os.environ.get("PSQL_COMMAND", "psql"))

def sql(query):
 return subprocess.run(PSQL + ['-v','ON_ERROR_STOP=1','-At'],input=query,text=True,capture_output=True)
service=str(uuid.uuid4()); admin=str(uuid.uuid4())
r=sql(f"insert into services(id,name,total_seats) values ('{service}','{service}',1); insert into auth.users values ('{admin}'); insert into admin_users(user_id) values ('{admin}');")
assert r.returncode==0,r.stderr
insert=f"insert into bookings(service_id,user_name,user_email,booking_date,start_time,end_time,seats_booked,interface_type) values ('{service}','Guest','guest@example.test',current_date+1,'12:00','13:00',1,'chat');"
p=subprocess.Popen(PSQL + ['-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
p.stdin.write('begin;'+insert+'select pg_sleep(1);commit;');p.stdin.close();time.sleep(.2)
r=sql(insert);p.wait();assert p.returncode==0,p.stderr.read();assert r.returncode!=0 and 'Not enough seats' in r.stderr,r.stderr
print('PASS: concurrent last-seat insert rejected after waiting for first commit')
r=sql(f"update services set total_seats=16 where id='{service}';");assert r.returncode==0,r.stderr
prefix=f"set test.user_id='{admin}';"
p=subprocess.Popen(PSQL + ['-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
p.stdin.write(prefix+f"begin; select replace_service_seat_maintenance('{service}',array['RS1']);select pg_sleep(1);commit;");p.stdin.close();time.sleep(.2)
r=sql(prefix+f"select replace_service_seat_maintenance('{service}',array['RS2']);");p.wait();assert p.returncode==0,p.stderr.read();assert r.returncode==0,r.stderr
r=sql(f"select string_agg(seat_label,',') from service_seat_maintenance where service_id='{service}' and is_active;");assert r.stdout.strip()=='RS2',r.stdout
print('PASS: concurrent maintenance replacement contains exactly the second seat set')
