ALTER TABLE seller_shipping_rates
  ADD COLUMN estimated_days INT UNSIGNED DEFAULT NULL AFTER price;

ALTER TABLE orders
  ADD COLUMN estimated_delivery_date DATE DEFAULT NULL AFTER shipping_cost;
