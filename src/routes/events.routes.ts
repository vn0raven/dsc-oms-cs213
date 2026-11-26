import { Hono } from 'hono';
import { requireAuth } from '../middleware/authentication';
import { ApiError } from '../utils/api-error';
import type { AppEnv } from '../types/app';
import {
 listEvents,getEvent,createEvent,editEvent,transitionEvent,getEventWorkspace,
 addEventTeam,proposeEventAppointment,respondEventAppointment,endEventAppointment,
 listMyEventAppointments,linkEventTask,unlinkEventTask,createEventTask
} from '../services/event.service';
const events=new Hono<AppEnv>({strict:false});
events.use('*',requireAuth);
async function optionalJson(c:{req:{text:()=>Promise<string>}}){const raw=await c.req.text();if(!raw.trim())return {};try{return JSON.parse(raw);}catch{throw new ApiError(400,'INVALID_JSON','A valid JSON body is required.');}}
async function json(c:{req:{json:()=>Promise<unknown>}}){
 try{return await c.req.json();}catch{throw new ApiError(400,'INVALID_JSON','A valid JSON body is required.');}
}
events.get('/',async c=>c.json({events:await listEvents(c.env,c.get('user'))}));
events.get('/my-appointments',async c=>c.json({appointments:await listMyEventAppointments(c.env,c.get('user'))}));
events.get('/:id',async c=>c.json({event:await getEvent(c.env,c.get('user'),c.req.param('id'))}));
events.get('/:id/workspace',async c=>c.json(await getEventWorkspace(c.env,c.get('user'),c.req.param('id'))));
events.post('/',async c=>c.json({event:await createEvent(c.env,c.get('user'),await json(c))},201));
events.patch('/:id',async c=>c.json({event:await editEvent(c.env,c.get('user'),c.req.param('id'),await json(c))}));
events.post('/:id/submit',async c=>c.json({event:await transitionEvent(c.env,c.get('user'),c.req.param('id'),'submit',{})}));
events.post('/:id/approve',async c=>c.json({event:await transitionEvent(c.env,c.get('user'),c.req.param('id'),'approve',await json(c))}));
events.post('/:id/return',async c=>c.json({event:await transitionEvent(c.env,c.get('user'),c.req.param('id'),'return',await json(c))}));
events.post('/:id/reject',async c=>c.json({event:await transitionEvent(c.env,c.get('user'),c.req.param('id'),'reject',await json(c))}));
events.post('/:id/revise',async c=>c.json({event:await transitionEvent(c.env,c.get('user'),c.req.param('id'),'revise',{})}));
events.post('/:id/advance',async c=>c.json({event:await transitionEvent(c.env,c.get('user'),c.req.param('id'),'advance',await optionalJson(c))}));
events.post('/:id/close',async c=>c.json({event:await transitionEvent(c.env,c.get('user'),c.req.param('id'),'close',await json(c))}));
events.post('/:id/cancel',async c=>c.json({event:await transitionEvent(c.env,c.get('user'),c.req.param('id'),'cancel',await json(c))}));
events.post('/:id/teams',async c=>c.json({team:await addEventTeam(c.env,c.get('user'),c.req.param('id'),await json(c))},201));
events.post('/:id/appointments',async c=>c.json({appointment:await proposeEventAppointment(c.env,c.get('user'),c.req.param('id'),await json(c))},201));
events.post('/appointments/:appointmentId/accept',async c=>c.json({appointment:await respondEventAppointment(c.env,c.get('user'),c.req.param('appointmentId'),'accept')}));
events.post('/appointments/:appointmentId/decline',async c=>c.json({appointment:await respondEventAppointment(c.env,c.get('user'),c.req.param('appointmentId'),'decline')}));
events.post('/:id/appointments/:appointmentId/end',async c=>c.json({appointment:await endEventAppointment(c.env,c.get('user'),c.req.param('id'),c.req.param('appointmentId'),await json(c))}));
events.post('/:id/tasks/create',async c=>{const result=await createEventTask(c.env,c.get('user'),c.req.param('id'),await json(c));return c.json(result,result.replayed?200:201);});
events.post('/:id/tasks',async c=>c.json({link:await linkEventTask(c.env,c.get('user'),c.req.param('id'),await json(c))},201));
events.delete('/:id/tasks/:taskId',async c=>c.json(await unlinkEventTask(c.env,c.get('user'),c.req.param('id'),c.req.param('taskId'))));
export default events;
