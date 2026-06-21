USE courtzon_v2;

ALTER TABLE bookings
  ADD COLUMN payment_method VARCHAR(50) DEFAULT NULL
  AFTER payment_status;
