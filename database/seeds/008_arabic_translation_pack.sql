-- Arabic translation pack (locale='ar') for the F-05 + B4 UI keys
-- (tournament format/validation display and doubles pairing player picker).
-- INSERT IGNORE: safe on both fresh environments and populated DBs.
-- Apply on existing environments with: node backend/scripts/seed.js --seed-file database/seeds/008_arabic_translation_pack.sql

INSERT IGNORE INTO `translations` (`key`, `locale`, `value`, `is_auto`) VALUES
('tournaments.create.validation.rule_set_requires_format','ar','اختر نظام المباريات قبل اختيار مجموعة القواعد',0),
('tournaments.pair_select_competition','ar','المنافسة',0),
('tournaments.pair_select_competition_placeholder','ar','اختر منافسة…',0),
('tournaments.pair_competition_required','ar','اختر منافسة قبل إنشاء الزوجي.',0),
('tournaments.pair_search_players','ar','اللاعبون (بحث بالاسم)',0),
('tournaments.pair_search_placeholder','ar','ابحث بين اللاعبين المسجَّلين بالاسم',0),
('tournaments.pair_available_players','ar','اللاعبون المسجَّلون',0),
('tournaments.pair_no_players','ar','لا يوجد لاعبون مسجَّلون مطابقون.',0),
('tournaments.pair_player_already_assigned','ar','مسجَّل بالفعل في فريق/زوجي',0),
('tournaments.pair_player_assignment_unknown','ar','لا يمكن التحقق من التوفّر في المنافسة المختارة',0),
('tournaments.pair_selected_players','ar','اللاعبون المختارون',0),
('tournaments.pair_selected','ar','مُختار',0),
('tournaments.pair_add','ar','إضافة',0),
('tournaments.pair_remove_player','ar','إزالة اللاعب',0),
('tournaments.pair_members_hint','ar','اختر اللاعبين المسجَّلين بالاسم. اشتراك واحد للبطولة — ودفعة واحدة. يُفرض حجم التشكيل من الخادم.',0);
