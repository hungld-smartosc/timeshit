/*global chrome*/

import React, { useState, useEffect } from 'react';
import styles from './styles/App.module.scss';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const today = new Date();
const currentMonth = MONTHS[today.getMonth()];
const currentDay = getDay(today);

function App() {
  const [_projects, setProjects] = useState([]);
  const [_tasks, setTasks] = useState([]);
  const [_user, setUser] = useState('');
  const [_project, pickProject] = useState('');
  const [_task, pickTask] = useState('');
  const [CSRF_TOKEN, setToken] = useState('');
  const [_shitDays, setShitdays] = useState({
    needAttendance: {},
    needLog: {},
  });
  function getCookies(domain, callback) {
    chrome.cookies.get({ url: domain, name: 'CSRF_TOKEN' }, function (cookie) {
      if (callback) {
        callback(cookie.value);
      }
    });
  }

  getCookies('https://people.zoho.com' ?? 'https://people.smartosc.com', function (CSRF_TOKEN) {
    setToken(CSRF_TOKEN);
  });

  useEffect(() => {
    init({
      setProjects,
      setTasks,
      setUser,
      setShitdays,
      pickProject,
      pickTask,
      CSRF_TOKEN,
    });
  }, [CSRF_TOKEN]);
  const handleProjectChange = (e) => {
    pickProject(e.target.value);
  };
  const handleTaskChange = (e) => {
    pickTask(e.target.value);
  };
  const handleLog = async () => {
    const logTimeSheetPromises = [];
    for (const day in _shitDays.needLog) {
      const body = {
        projectId: _project,
        taskId: _task,
        userId: _user,
        date: day,
        hour: _shitDays.needLog[day],
      };
      logTimeSheetPromises.push(logTimeSheet(CSRF_TOKEN, body));
    }
    await Promise.all(logTimeSheetPromises);
    await init({
      setProjects,
      setTasks,
      setUser,
      setShitdays,
      pickProject,
      pickTask,
      CSRF_TOKEN,
    });
    alert('Done');
  };
  return (
    <div className="App">
      <div className={styles.projectSelectContainer}>
        <label for="Project" className={styles.labelTitle}>Project: </label>
        <select
          value={_project}
          name="Project"
          id="Project"
          onChange={handleProjectChange}
          className={styles.selectContainer}
        >
          {_projects.map((project) => (
            <option value={project.Id}>
              <p dangerouslySetInnerHTML={{ __html: project.Value }} />
            </option>
          ))}
        </select>
      </div>
      <div className={styles.taskSelectContainer}>
        <label for="Task" className={styles.labelTitle}>Task: </label>
        <select value={_task} name="Task" id="Task" onChange={handleTaskChange} className={styles.selectContainer}
        >
          {_tasks.map((task) => (
            <option value={task.Id}>
              <p dangerouslySetInnerHTML={{ __html: task.Value }} />
            </option>
          ))}
        </select>
      </div>
      <div className={styles.shitDayContainer}>
        <b>Các ngày cần log timesheet:</b>
        <ol>
          {Object.keys(_shitDays.needLog).map((day) => (
            <li key={day}>
              {day}: {_shitDays.needLog[day]}h
            </li>
          ))}
        </ol>
        <button onClick={handleLog} className={styles.logButton}>Log</button>
      </div>
      <div className={styles.attendanceDayContainer}>
        <b>Các ngày cần xin attendance:</b>
        <ol>
          {Object.keys(_shitDays.needAttendance).map((day) => (
            <li key={day}>
              {day}: {_shitDays.needAttendance[day]}h
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

async function init({
  setUser,
  setProjects,
  setTasks,
  setShitdays,
  pickProject,
  pickTask,
  CSRF_TOKEN,
}) {
  const { tasks, projects, userId } = await fetchTasksAndProjects(CSRF_TOKEN);
  setUser(userId);
  setProjects(projects);
  setTasks(tasks);
  //Set default project and task
  pickProject(projects[0].Id);
  pickTask(tasks[0].Id);
  const shitDays = await getShitDays(CSRF_TOKEN);
  setShitdays(shitDays);
}

// API
async function fetchAttendance(CSRF_TOKEN) {
  const response = await fetch(
    'https://people.zoho.com/hrportal1524046581683/AttendanceViewAction.zp',
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: `mode=getAttList&conreqcsr=${CSRF_TOKEN}&loadToday=false&view=month&preMonth=0`,
      method: 'POST',
    }
  );
  const { dayList } = await response.json();
  const dayAndTime = {};
  for (const index in dayList) {
    const day = dayList[index];
    if (day.status === 'Weekend') continue;
    dayAndTime[day.ldate] = parseTime(day.tHrs);
  }
  return dayAndTime;
}

async function fetchTasksAndProjects(CSRF_TOKEN) {
  const response = await fetch(
    'https://people.zoho.com/hrportal1524046581683/formAction.zp',
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: `formId=412762000003736053&mode=getFormComponents&subMode=ADD&conreqcsr=${CSRF_TOKEN}`,
      method: 'POST',
    }
  );
  const {
    message: {
      formComponentDetails: [
        {
          column1: [
            {
              AddOptions: [{ Id: userId }],
            },
            ,
            ,
            { Options: Tasks },
          ],
          column2: [{ Options: Projects }],
        },
      ],
    },
  } = await response.json();
  return {
    userId,
    tasks: Tasks,
    projects: Projects,
  };
}

async function getLoggedDay(CSRF_TOKEN) {
  const response = await fetch(
    'https://people.zoho.com/hrportal1524046581683/viewAction.zp',
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: `mode=fetchRecords&formId=412762000003736053&viewId=412762000003736055&isOnload=false&typeOfView=self&startInd=0&limit=30&conreqcsr=${CSRF_TOKEN}`,
      method: 'POST',
    }
  );
  const {
    recordDetails: {
      message: { recordDetails },
    },
  } = await response.json();
  return recordDetails
    .filter(
      (record) => record.approvalStatus === 1 || record.approvalStatus === -1
    )
    .map((record) => record.fieldDetails[2])
    .filter((day) => day.includes(currentMonth));
}

async function getShitDays(CSRF_TOKEN) {
  const needLog = {};
  const needAttendance = {};
  const attendance = await fetchAttendance(CSRF_TOKEN);
  const loggedDays = await getLoggedDay(CSRF_TOKEN);
  loggedDays.forEach((loggedDay) => delete attendance[loggedDay]);
  for (const remainDay in attendance) {
    if (remainDay < currentDay) {
      if (attendance[remainDay] < 6) {
        needAttendance[remainDay] = attendance[remainDay];
      } else {
        needLog[remainDay] = attendance[remainDay];
      }
    } else {
      delete attendance[remainDay];
    }
  }
  return { needLog, needAttendance };
}

async function logTimeSheet(CSRF_TOKEN, body) {
  // Date:  04-Jul-2022
  const { projectId, taskId, userId, hour, date } = body;
  await fetch(
    'https://people.zoho.com/hrportal1524046581683/addUpdateRecord.zp',
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: `isPicklistIdEnabled=true&Emp_info=${userId}&Task=${taskId}&Timesheet_Hours=${hour}&Project=${projectId}&Work_location=412762000010757909&Date=${date}&Task_Description=&Billable_Hours=0&zp_tableName=t_412762000003736053&conreqcsr=${CSRF_TOKEN}&zp_formId=412762000003736053&zp_mode=addRecord&isDraft=false&isResubmit=false`,
      method: 'POST',
    }
  );
}
//////////////////////////////////////////////////////

// Helper
function roundHalf(num) {
  return Math.round(num * 2) / 2;
}

function parseTime(time) {
  const [hour, minute] = time.split(':');
  return roundHalf(Number(hour) + Number(minute) / 60);
}

function getDay(date) {
  let d = date.toISOString().split('T')[0].split('-');
  const m = Number(d[1]) - 1;
  d[1] = MONTHS[m];
  [d[0], d[2]] = [d[2], d[0]];
  return d.join('-');
}
/////////////////////////////////////////////////////

export default App;
