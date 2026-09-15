import {openDatabase,migrate} from '../server/db.mjs';const db=openDatabase();try{await migrate(db);console.log('PostgreSQL schema ready.')}finally{await db.close()}
