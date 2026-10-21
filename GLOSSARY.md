# Nimbus

A project management app where teams plan and track work in projects, boards and sprints. This glossary also covers the words the team uses for its own development work, because some of them collide with product terms.

## Product

**Project**:
A place where a team plans and tracks its work. It holds the team's Issues, boards and sprints.
_Avoid_: Workspace, space, board

**Project key**:
A short code that identifies a project and prefixes its Issue numbers, as in `NIM-12`. It never changes and is never reused.
_Avoid_: Prefix, slug, code

**Archived project**:
A project closed to all changes and hidden by default, which can be restored.
_Avoid_: Deleted, closed or inactive project

**Issue**:
A unit of work a team tracks inside a Nimbus project. Only ever means the product concept.
_Avoid_: Ticket, task, GitHub issue

**Issue key**:
The Project key and the Issue's number in that project, as in `NIM-12`, which names one Issue for good.
_Avoid_: Issue ID, ticket number

**Status**:
The stage an Issue is at in its project, such as To do or In review; each project has its own ordered Statuses.
_Avoid_: State, column, stage

**Status category**:
One of three fixed groups every Status belongs to (To do, In progress, Done), which the rest of Nimbus uses instead of Status names.
_Avoid_: Status type, phase

**Issue type**:
What kind of work an Issue is: a Story (something new for users), a Bug (something broken) or a Chore (other necessary work).
_Avoid_: Task (as a type), category

**Reporter**:
The User who created an Issue.
_Avoid_: Creator, author, owner

**Assignee**:
The Member responsible for doing an Issue.
_Avoid_: Owner, responsible

**User**:
A person who can sign in to Nimbus, identified by their email address. One person is one User, however many ways they sign in.
_Avoid_: Account, login

**Unverified User**:
A User who hasn't yet proved they own their email address. They can sign in but can't use Nimbus until they do.
_Avoid_: Pending, inactive or unconfirmed user

**Verification code**:
A short-lived code emailed to a User to prove they own the address.
_Avoid_: OTP, token, PIN

**Reset code**:
A short-lived code emailed to a User who forgot their password, which lets them set a new one. Entering it also proves they own the address.
_Avoid_: Password token, OTP

**Two-step verification**:
A setting a User turns on for themselves so that signing in also needs a Sign-in code from an authenticator app on their phone, not only a password or a Linked identity.
_Avoid_: MFA, 2FA, two-factor authentication

**Sign-in code**:
The short code an authenticator app shows, which a User with Two-step verification types as the second step of signing in.
_Avoid_: OTP, TOTP code, token, Verification code

**Recovery code**:
One of a set of single-use codes a User saves when turning on Two-step verification. Each one stands in for a Sign-in code once, for when they've lost their phone. Not a Reset code.
_Avoid_: Backup code, Reset code

**Member**:
A User who has been added to a project. Only ever means project membership.
_Avoid_: User (when you mean project membership)

**Permission**:
One action a User may be allowed to do, such as editing an Issue.
_Avoid_: Right, privilege, capability

**Role**:
A named set of Grants that can be given to Users, such as Project admin or Viewer.
_Avoid_: Group, permission group, permission set

**Grant**:
A Permission inside a Role, together with its Scope.
_Avoid_: Rule, policy

**Scope**:
How far a Grant reaches: only the User's own records, everything in the project, or everything in Nimbus.
_Avoid_: Range, level, visibility

**Role assignment**:
A User holding a Role, either across all of Nimbus or in one project.
_Avoid_: Group membership, role member

**Session**:
One sign-in on one browser. It lasts while that browser keeps using Nimbus, up to 90 days, and ends early when the User signs out of it. The Security page lists a User's Sessions, and its copy may say "device".
_Avoid_: Login, device

**Linked identity**:
A Google or GitHub login attached to a User, letting them sign in without a password. A User links one by connecting it on the Security page and unlinks it by disconnecting it. A disconnected one is not linked again until the User connects it.
_Avoid_: Social account, external account, provider user, connected account (UI copy only)

**Notification**:
A message to one User about something that happened to an Issue they're involved with or to their account, shown in Nimbus and sometimes emailed.
_Avoid_: Alert (for Issue ones), message, activity

**Security alert**:
A Notification about a change to a User's sign-in or account security, which they can't turn off.
_Avoid_: Warning, security notification

## Development workflow

**Feature spec**:
A written plan for one feature (problem, user stories, decisions), kept as a GitHub issue and closed once the feature ships.
_Avoid_: Spec, PRD, issue

**Ticket**:
One small, independently shippable slice of a feature spec, kept as a GitHub sub-issue of that feature spec.
_Avoid_: Issue, task, story

**Module spec**:
A living document in the repo describing how one backend module works now: its public interface, events and tables.
_Avoid_: Spec, design doc
