begin;

-- Attendance data is private to active administrators, including published services.
-- The existing admin policy continues to allow reading and managing attendance.
drop policy ministry_schedule_attendance_team_read_published
  on public.ministry_schedule_attendance;

commit;
