ALTER TABLE bookings MODIFY COLUMN booking_status ENUM('pending','confirmed','cancelled','completed','expired','checked_in','no_show') DEFAULT 'pending';

ALTER TABLE bookings MODIFY COLUMN payment_status ENUM('pending','paid','refunded','partially_refunded','failed') DEFAULT 'pending';
