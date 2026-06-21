import { batchInsert } from '../run.mjs'

const DEFAULT_HASH = '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ'
const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0

  const users = [
    { id: 1,  public_id: 'u00000001-0000-4000-8000-000000000001', country_id: 1, phone_number: '1012637733', full_phone: '+201012637733', email: 'mniazyy@gmail.com', password_hash: DEFAULT_HASH, full_name: 'Mohamed Niazy', gender: 'male', birth_date: '1990-05-15', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 2,  public_id: 'u00000001-0000-4000-8000-000000000002', country_id: 1, phone_number: '1001112233', full_phone: '+201001112233', email: 'ahmed.hassan@email.com', password_hash: DEFAULT_HASH, full_name: 'Ahmed Hassan', gender: 'male', birth_date: '1988-08-22', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 3,  public_id: 'u00000001-0000-4000-8000-000000000003', country_id: 1, phone_number: '1002223344', full_phone: '+201002223344', email: 'sara.mahmoud@email.com', password_hash: DEFAULT_HASH, full_name: 'Sara Mahmoud', gender: 'female', birth_date: '1992-03-10', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 4,  public_id: 'u00000001-0000-4000-8000-000000000004', country_id: 1, phone_number: '1003334455', full_phone: '+201003334455', email: 'khaled.ali@email.com', password_hash: DEFAULT_HASH, full_name: 'Khaled Ali', gender: 'male', birth_date: '1985-11-05', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 5,  public_id: 'u00000001-0000-4000-8000-000000000005', country_id: 1, phone_number: '1004445566', full_phone: '+201004445566', email: 'nour.ibrahim@email.com', password_hash: DEFAULT_HASH, full_name: 'Nour Ibrahim', gender: 'female', birth_date: '1995-07-20', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 6,  public_id: 'u00000001-0000-4000-8000-000000000006', country_id: 1, phone_number: '1005556677', full_phone: '+201005556677', email: 'omar.saleh@email.com', password_hash: DEFAULT_HASH, full_name: 'Omar Saleh', gender: 'male', birth_date: '1993-01-12', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 7,  public_id: 'u00000001-0000-4000-8000-000000000007', country_id: 1, phone_number: '1006667788', full_phone: '+201006667788', email: 'heba.mostafa@email.com', password_hash: DEFAULT_HASH, full_name: 'Heba Mostafa', gender: 'female', birth_date: '1991-09-30', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 8,  public_id: 'u00000001-0000-4000-8000-000000000008', country_id: 1, phone_number: '1007778899', full_phone: '+201007778899', email: 'amr.youssef@email.com', password_hash: DEFAULT_HASH, full_name: 'Amr Youssef', gender: 'male', birth_date: '1987-04-18', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 9,  public_id: 'u00000001-0000-4000-8000-000000000009', country_id: 1, phone_number: '1008889900', full_phone: '+201008889900', email: 'dina.samy@email.com', password_hash: DEFAULT_HASH, full_name: 'Dina Samy', gender: 'female', birth_date: '1994-06-25', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 10, public_id: 'u00000001-0000-4000-8000-000000000010', country_id: 1, phone_number: '1009990011', full_phone: '+201009990011', email: 'tamer.shaker@email.com', password_hash: DEFAULT_HASH, full_name: 'Tamer Shaker', gender: 'male', birth_date: '1989-12-08', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 11, public_id: 'u00000001-0000-4000-8000-000000000011', country_id: 1, phone_number: '1010001122', full_phone: '+201010001122', email: 'yassin.adel@email.com', password_hash: DEFAULT_HASH, full_name: 'Yassin Adel', gender: 'male', birth_date: '1996-02-14', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 12, public_id: 'u00000001-0000-4000-8000-000000000012', country_id: 1, phone_number: '1011112233', full_phone: '+201011112233', email: 'salma.fahmy@email.com', password_hash: DEFAULT_HASH, full_name: 'Salma Fahmy', gender: 'female', birth_date: '1997-10-05', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 13, public_id: 'u00000001-0000-4000-8000-000000000013', country_id: 1, phone_number: '1012223344', full_phone: '+201012223344', email: 'ziad.khalil@email.com', password_hash: DEFAULT_HASH, full_name: 'Ziad Khalil', gender: 'male', birth_date: '1998-08-20', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 14, public_id: 'u00000001-0000-4000-8000-000000000014', country_id: 1, phone_number: '1013334455', full_phone: '+201013334455', email: 'mariam.sadek@email.com', password_hash: DEFAULT_HASH, full_name: 'Mariam Sadek', gender: 'female', birth_date: '1995-04-12', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 15, public_id: 'u00000001-0000-4000-8000-000000000015', country_id: 1, phone_number: '1014445566', full_phone: '+201014445566', email: 'seif.galal@email.com', password_hash: DEFAULT_HASH, full_name: 'Seif Galal', gender: 'male', birth_date: '1993-11-30', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 16, public_id: 'u00000001-0000-4000-8000-000000000016', country_id: 1, phone_number: '1015556677', full_phone: '+201015556677', email: 'aya.osman@email.com', password_hash: DEFAULT_HASH, full_name: 'Aya Osman', gender: 'female', birth_date: '1996-06-15', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 17, public_id: 'u00000001-0000-4000-8000-000000000017', country_id: 1, phone_number: '1016667788', full_phone: '+201016667788', email: 'karim.rashwan@email.com', password_hash: DEFAULT_HASH, full_name: 'Karim Rashwan', gender: 'male', birth_date: '1990-09-22', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 18, public_id: 'u00000001-0000-4000-8000-000000000018', country_id: 1, phone_number: '1017778899', full_phone: '+201017778899', email: 'reem.shalaby@email.com', password_hash: DEFAULT_HASH, full_name: 'Reem Shalaby', gender: 'female', birth_date: '1998-01-08', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 19, public_id: 'u00000001-0000-4000-8000-000000000019', country_id: 1, phone_number: '1018889900', full_phone: '+201018889900', email: 'hany.abdou@email.com', password_hash: DEFAULT_HASH, full_name: 'Hany Abdou', gender: 'male', birth_date: '1986-07-19', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 20, public_id: 'u00000001-0000-4000-8000-000000000020', country_id: 1, phone_number: '1019990011', full_phone: '+201019990011', email: 'nada.elsharkawy@email.com', password_hash: DEFAULT_HASH, full_name: 'Nada El Sharkawy', gender: 'female', birth_date: '1997-12-25', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 21, public_id: 'u00000001-0000-4000-8000-000000000021', country_id: 1, phone_number: '1020001122', full_phone: '+201020001122', email: 'sameh.mansour@email.com', password_hash: DEFAULT_HASH, full_name: 'Sameh Mansour', gender: 'male', birth_date: '1992-03-11', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 22, public_id: 'u00000001-0000-4000-8000-000000000022', country_id: 1, phone_number: '1021112233', full_phone: '+201021112233', email: 'ghada.fouad@email.com', password_hash: DEFAULT_HASH, full_name: 'Ghada Fouad', gender: 'female', birth_date: '1994-09-17', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 23, public_id: 'u00000001-0000-4000-8000-000000000023', country_id: 1, phone_number: '1022223344', full_phone: '+201022223344', email: 'nabil.essa@email.com', password_hash: DEFAULT_HASH, full_name: 'Nabil Essa', gender: 'male', birth_date: '1988-05-23', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 24, public_id: 'u00000001-0000-4000-8000-000000000024', country_id: 1, phone_number: '1023334455', full_phone: '+201023334455', email: 'habiba.naguib@email.com', password_hash: DEFAULT_HASH, full_name: 'Habiba Naguib', gender: 'female', birth_date: '1999-01-30', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 25, public_id: 'u00000001-0000-4000-8000-000000000025', country_id: 1, phone_number: '1024445566', full_phone: '+201024445566', email: 'ramy.badawy@email.com', password_hash: DEFAULT_HASH, full_name: 'Ramy Badawy', gender: 'male', birth_date: '1991-10-05', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 26, public_id: 'u00000001-0000-4000-8000-000000000026', country_id: 1, phone_number: '1025556677', full_phone: '+201025556677', email: 'farida.elshazly@email.com', password_hash: DEFAULT_HASH, full_name: 'Farida El Shazly', gender: 'female', birth_date: '1996-08-14', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 27, public_id: 'u00000001-0000-4000-8000-000000000027', country_id: 1, phone_number: '1026667788', full_phone: '+201026667788', email: 'maged.elkady@email.com', password_hash: DEFAULT_HASH, full_name: 'Maged El Kady', gender: 'male', birth_date: '1987-02-28', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 28, public_id: 'u00000001-0000-4000-8000-000000000028', country_id: 1, phone_number: '1027778899', full_phone: '+201027778899', email: 'laila.elnagar@email.com', password_hash: DEFAULT_HASH, full_name: 'Laila El Nagar', gender: 'female', birth_date: '1998-11-20', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 29, public_id: 'u00000001-0000-4000-8000-000000000029', country_id: 1, phone_number: '1028889900', full_phone: '+201028889900', email: 'raouf.shahine@email.com', password_hash: DEFAULT_HASH, full_name: 'Raouf Shahine', gender: 'male', birth_date: '1989-06-12', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 30, public_id: 'u00000001-0000-4000-8000-000000000030', country_id: 1, phone_number: '1029990011', full_phone: '+201029990011', email: 'kenzy.elshamy@email.com', password_hash: DEFAULT_HASH, full_name: 'Kenzy El Shamy', gender: 'female', birth_date: '1997-04-09', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 31, public_id: 'u00000001-0000-4000-8000-000000000031', country_id: 1, phone_number: '1030001122', full_phone: '+201030001122', email: 'adam.lotfy@email.com', password_hash: DEFAULT_HASH, full_name: 'Adam Lotfy', gender: 'male', birth_date: '2000-01-15', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 32, public_id: 'u00000001-0000-4000-8000-000000000032', country_id: 1, phone_number: '1031112233', full_phone: '+201031112233', email: 'malak.gamal@email.com', password_hash: DEFAULT_HASH, full_name: 'Malak Gamal', gender: 'female', birth_date: '1999-07-22', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 33, public_id: 'u00000001-0000-4000-8000-000000000033', country_id: 1, phone_number: '1032223344', full_phone: '+201032223344', email: 'fady.saad@email.com', password_hash: DEFAULT_HASH, full_name: 'Fady Saad', gender: 'male', birth_date: '1995-03-28', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 34, public_id: 'u00000001-0000-4000-8000-000000000034', country_id: 1, phone_number: '1033334455', full_phone: '+201033334455', email: 'rana.elgendy@email.com', password_hash: DEFAULT_HASH, full_name: 'Rana Elgendy', gender: 'female', birth_date: '1996-12-05', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 35, public_id: 'u00000001-0000-4000-8000-000000000035', country_id: 1, phone_number: '1034445566', full_phone: '+201034445566', email: 'ehab.shaker@email.com', password_hash: DEFAULT_HASH, full_name: 'Ehab Shaker', gender: 'male', birth_date: '1990-09-18', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 36, public_id: 'u00000001-0000-4000-8000-000000000036', country_id: 1, phone_number: '1035556677', full_phone: '+201035556677', email: 'noha.tawfik@email.com', password_hash: DEFAULT_HASH, full_name: 'Noha Tawfik', gender: 'female', birth_date: '1994-05-30', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 37, public_id: 'u00000001-0000-4000-8000-000000000037', country_id: 1, phone_number: '1036667788', full_phone: '+201036667788', email: 'ashraf.elgammal@email.com', password_hash: DEFAULT_HASH, full_name: 'Ashraf El Gammal', gender: 'male', birth_date: '1986-11-10', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 38, public_id: 'u00000001-0000-4000-8000-000000000038', country_id: 1, phone_number: '1037778899', full_phone: '+201037778899', email: 'donia.eldesouky@email.com', password_hash: DEFAULT_HASH, full_name: 'Donia El Desouky', gender: 'female', birth_date: '1998-08-25', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 39, public_id: 'u00000001-0000-4000-8000-000000000039', country_id: 1, phone_number: '1038889900', full_phone: '+201038889900', email: 'hesham.elshafei@email.com', password_hash: DEFAULT_HASH, full_name: 'Hesham El Shafei', gender: 'male', birth_date: '1988-04-07', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 40, public_id: 'u00000001-0000-4000-8000-000000000040', country_id: 1, phone_number: '1039990011', full_phone: '+201039990011', email: 'omneya.soliman@email.com', password_hash: DEFAULT_HASH, full_name: 'Omneya Soliman', gender: 'female', birth_date: '1997-02-14', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 41, public_id: 'u00000001-0000-4000-8000-000000000041', country_id: 1, phone_number: '1040001122', full_phone: '+201040001122', email: 'mahmoud.rady@email.com', password_hash: DEFAULT_HASH, full_name: 'Mahmoud Rady', gender: 'male', birth_date: '1993-10-12', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 42, public_id: 'u00000001-0000-4000-8000-000000000042', country_id: 1, phone_number: '1041112233', full_phone: '+201041112233', email: 'manal.elwakeel@email.com', password_hash: DEFAULT_HASH, full_name: 'Manal El Wakeel', gender: 'female', birth_date: '1991-06-28', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 43, public_id: 'u00000001-0000-4000-8000-000000000043', country_id: 1, phone_number: '1042223344', full_phone: '+201042223344', email: 'moustafa.sabry@email.com', password_hash: DEFAULT_HASH, full_name: 'Moustafa Sabry', gender: 'male', birth_date: '1989-01-20', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 44, public_id: 'u00000001-0000-4000-8000-000000000044', country_id: 1, phone_number: '1043334455', full_phone: '+201043334455', email: 'shaimaa.ezz@email.com', password_hash: DEFAULT_HASH, full_name: 'Shaimaa Ezz', gender: 'female', birth_date: '1996-07-15', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 45, public_id: 'u00000001-0000-4000-8000-000000000045', country_id: 1, phone_number: '1044445566', full_phone: '+201044445566', email: 'walid.shokry@email.com', password_hash: DEFAULT_HASH, full_name: 'Walid Shokry', gender: 'male', birth_date: '1987-09-03', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 46, public_id: 'u00000001-0000-4000-8000-000000000046', country_id: 1, phone_number: '1045556677', full_phone: '+201045556677', email: 'samar.hamdy@email.com', password_hash: DEFAULT_HASH, full_name: 'Samar Hamdy', gender: 'female', birth_date: '1995-12-19', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'dark', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 47, public_id: 'u00000001-0000-4000-8000-000000000047', country_id: 1, phone_number: '1046667788', full_phone: '+201046667788', email: 'nader.helmy@email.com', password_hash: DEFAULT_HASH, full_name: 'Nader Helmy', gender: 'male', birth_date: '1992-04-22', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 48, public_id: 'u00000001-0000-4000-8000-000000000048', country_id: 1, phone_number: '1047778899', full_phone: '+201047778899', email: 'rania.elshafei@email.com', password_hash: DEFAULT_HASH, full_name: 'Rania El Shafei', gender: 'female', birth_date: '1998-10-08', language_id: 2, timezone: 'Africa/Cairo', dark_mode: 'light', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 49, public_id: 'u00000001-0000-4000-8000-000000000049', country_id: 1, phone_number: '1048889900', full_phone: '+201048889900', email: 'sherif.abaza@email.com', password_hash: DEFAULT_HASH, full_name: 'Sherif Abaza', gender: 'male', birth_date: '1990-08-16', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
    { id: 50, public_id: 'u00000001-0000-4000-8000-000000000050', country_id: 1, phone_number: '1049990011', full_phone: '+201049990011', email: 'mai.ghoneim@email.com', password_hash: DEFAULT_HASH, full_name: 'Mai Ghoneim', gender: 'female', birth_date: '1997-11-27', language_id: 1, timezone: 'Africa/Cairo', dark_mode: 'system', account_status: 'active', is_phone_verified: 1, is_email_verified: 1 },
  ]

  total += await batchInsert(conn, 'users', ['id','public_id','country_id','phone_number','full_phone','email','password_hash','full_name','gender','birth_date','language_id','timezone','dark_mode','account_status','is_phone_verified','is_email_verified'], users)
  ctx.userIds = users.map(u => u.id)

  const [sportRows] = await conn.query('SELECT id FROM sports ORDER BY id')
  const sportIds = sportRows.map(r => r.id)

  const players = users.filter(u => u.id >= 11)
  const playerProfiles = players.map((u, i) => ({
    id: i + 1,
    user_id: u.id,
    main_sport_id: sportIds.length ? sportIds[i % sportIds.length] : null,
    main_level_id: (i % 5) + 1,
    is_coach: 0,
    is_seller: i % 4 === 0 ? 1 : 0,
    bio: `${u.full_name} is an active sports enthusiast based in Egypt.`,
  }))
  total += await batchInsert(conn, 'player_profiles', ['id','user_id','main_sport_id','main_level_id','is_coach','is_seller','bio'], playerProfiles)

  const ratings = []
  let ratingId = 1
  for (let i = 0; i < 30; i++) {
    const rater = users[(i + 3) % users.length]
    const rated = players[i % players.length]
    ratings.push({
      id: ratingId++,
      rater_id: rater.id,
      rated_id: rated.id,
      booking_id: null,
      rating: Math.floor(3 + Math.random() * 3),
      review_text: ['Great player! Very skilled.','Good sportsmanship.','Excellent match!','Fair play all the way.','Would play again!','Strong opponent!'][i % 6],
    })
  }
  total += await batchInsert(conn, 'player_ratings', ['id','rater_id','rated_id','booking_id','rating','review_text'], ratings)

  const coaches = users.filter(u => u.id >= 6 && u.id <= 10)
  const coachProfiles = coaches.map((u, i) => ({
    id: i + 1,
    user_id: u.id,
    bio: `Professional coach with ${5 + i} years of experience. Certified by the Egyptian ${['Football','Tennis','Padel','Squash','Swimming'][i % 5]} Federation.`,
    experience_years: 5 + i,
    certifications: JSON.stringify([`Level ${i + 1} Coach Certificate`, 'First Aid Certified', 'Sports Nutrition']),
    sports: JSON.stringify([(i % 11) + 1]),
    hourly_rate: 200 + (i * 50),
    currency_code: 'EGP',
    is_verified: 1,
    created_at: NOW,
    updated_at: NOW,
  }))
  total += await batchInsert(conn, 'coach_profiles', ['id','user_id','bio','experience_years','certifications','sports','hourly_rate','currency_code','is_verified','created_at','updated_at'], coachProfiles)
  ctx.coachIds = coachProfiles.map(c => c.id)

  const userRoles = []
  let urId = 1
  for (const u of users) {
    const roleMap = {
      'u00000001-0000-4000-8000-000000000001': 1,
      'u00000002-0000-4000-8000-0000000000': 2,
    }
    let roleId = u.id === 1 ? 1 : (u.id <= 5 ? 2 : (u.id <= 10 ? 4 : 5))
    userRoles.push({ id: urId++, user_id: u.id, role_id: roleId, assigned_at: NOW, is_active: 1 })
  }
  total += await batchInsert(conn, 'user_roles', ['id','user_id','role_id','assigned_at','is_active'], userRoles)

  const wallets = users.map((u, i) => ({
    id: i + 1,
    user_id: u.id,
    balance: Math.round(Math.random() * 5000 * 100) / 100,
    currency_code: 'EGP',
    version: 1,
  }))
  total += await batchInsert(conn, 'user_wallets', ['id','user_id','balance','currency_code','version'], wallets)

  const cities = ['Cairo','Alexandria','Giza','New Cairo','Hurghada','Mansoura','Tanta']
  const addresses = []
  let addrId = 1
  for (let i = 0; i < 30; i++) {
    const city = cities[i % cities.length]
    addresses.push({
      id: addrId++,
      user_id: users[i].id,
      label: ['Home','Work','Vacation Home'][i % 3],
      full_name: users[i].full_name,
      phone: `+2010${String(5000000 + i).slice(0, 7)}`,
      street_address: `${Math.floor(Math.random() * 200) + 1} ${['El Tahrir','El Nasr','El Haram','El Nil','Abbas El Akkad','El Thawra','El Galaa'][i % 7]} Street, Building ${Math.floor(Math.random() * 20) + 1}, Apt ${Math.floor(Math.random() * 30) + 1}`,
      city: city,
      state: ['Cairo Governorate','Alexandria Governorate','Giza Governorate','Cairo Governorate','Red Sea Governorate','Dakahlia Governorate','Gharbia Governorate'][i % 7],
      postal_code: String(10000 + Math.floor(Math.random() * 90000)),
      country: 'Egypt',
      address_type: i < 7 ? 'both' : (i % 2 === 0 ? 'shipping' : 'billing'),
      is_default: i < 7 ? 1 : 0,
      created_at: NOW,
    })
  }
  total += await batchInsert(conn, 'user_addresses', ['id','user_id','label','full_name','phone','street_address','city','state','postal_code','country','address_type','is_default','created_at'], addresses)

  const devices = []
  let devId = 1
  for (let i = 0; i < 20; i++) {
    devices.push({
      id: devId++,
      user_id: users[i % users.length].id,
      device_fingerprint: `fp_${i}_${Date.now()}`,
      device_name: ['iPhone 15','Samsung S24','Chrome Desktop','Pixel 8','iPad Pro'][i % 5],
      device_type: ['mobile','mobile','desktop','mobile','tablet'][i % 5],
      os: ['iOS','Android','Windows','Android','iPadOS'][i % 5],
      browser: ['Safari','Chrome','Chrome','Chrome','Safari'][i % 5],
      ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      is_active: 1,
      last_seen_at: NOW,
      first_seen_at: NOW,
      created_at: NOW,
    })
  }
  total += await batchInsert(conn, 'user_devices', ['id','user_id','device_fingerprint','device_name','device_type','os','browser','ip_address','user_agent','is_active','last_seen_at','first_seen_at','created_at'], devices)

  const sessions = []
  let sessId = 1
  for (let i = 0; i < 15; i++) {
    sessions.push({
      id: sessId++,
      user_id: users[i].id,
      session_token: `sess_token_${i}_${Date.now()}`,
      refresh_token: `ref_${i}_${Date.now()}`,
      refresh_token_hash: `hash_${i}_${Date.now()}`,
      ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      expires_at: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 19).replace('T', ' '),
      created_at: NOW,
    })
  }
  total += await batchInsert(conn, 'user_sessions', ['id','user_id','session_token','refresh_token','refresh_token_hash','ip_address','user_agent','expires_at','created_at'], sessions)

  const prefs = []
  let prefId = 1
  for (const u of users.slice(0, 20)) {
    for (let catId = 1; catId <= 8; catId++) {
      prefs.push({
        id: prefId++,
        user_id: u.id,
        category_id: catId,
        is_allowed: 1,
        push_enabled: 1,
        email_enabled: 1,
        sms_enabled: 0,
      })
    }
  }
  total += await batchInsert(conn, 'user_notification_preferences', ['id','user_id','category_id','is_allowed','push_enabled','email_enabled','sms_enabled'], prefs)

  return total
}
