ALTER TABLE permissions
MODIFY COLUMN element_type ENUM('button','tab','page','section','action','field') DEFAULT NULL;
