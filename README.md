# WebMonkeyBall
Super Monkey Ball on Web Broser. WITH MULTIPLAYER!!!!111

# Instructions
- extract files from Super Monkey Ball iso using dolphin (specifically test folder)
- put test folder in smb1_content
- run npm install and npm run build
- run node server.js
- Win!

# Known Bugs/Exploits
- player balls are floaty when you move your camera
- server does not wait for all players to finish downloading a level, causing potential desync
- difficulty changes are not synced
- spawn camera speed allows potential desync
- server does not verify levels; it is completely possible to write a custom client that loads different levels 
- other desync issues i haven't fully tracked down yet

# TODO
- add chat
- add server/lobby browser
- add gamemodes
- add other quality of life features