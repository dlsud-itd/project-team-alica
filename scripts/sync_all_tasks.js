const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runGraphQL(query, variables = {}, retries = 4) {
  const payload = JSON.stringify({ query, variables });
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = spawnSync('gh', ['api', 'graphql', '--input', '-'], {
      input: payload,
      encoding: 'utf8'
    });
    if (res.status === 0) {
      const parsed = JSON.parse(res.stdout);
      if (parsed.errors && parsed.errors.length > 0) {
        throw new Error(`GraphQL errors: ${JSON.stringify(parsed.errors)}`);
      }
      return parsed.data;
    }
    const errText = res.stderr || res.stdout;
    console.warn(`[Attempt ${attempt}/${retries}] Network error: ${errText.trim()}`);
    if (attempt === retries) {
      throw new Error(`GraphQL failed after ${retries} attempts: ${errText}`);
    }
    // Exponential backoff
    const waitTime = attempt * 2000;
    const end = Date.now() + waitTime;
    while (Date.now() < end) {}
  }
}

const PROJECT_ID = 'PVT_kwDOE3qugs4BnB-n';

async function main() {
  const tasksFile = path.join(__dirname, 'timeline_tasks.json');
  const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  console.log(`Loaded ${tasks.length} tasks from timeline_tasks.json`);

  // 1. Fetch Fields and Options
  console.log('Fetching project fields...');
  const fieldsQuery = `
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;
  const fieldsData = runGraphQL(fieldsQuery, { id: PROJECT_ID });
  const fields = fieldsData.node.fields.nodes;
  const fieldMap = {};
  for (const f of fields) {
    fieldMap[f.name] = f;
  }
  console.log(`Found ${fields.length} fields in project.`);

  // 2. Fetch existing items (paginate up to 100)
  console.log('Fetching existing items...');
  const itemsQuery = `
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              fieldValueByName(name: "Title") {
                ... on ProjectV2ItemFieldTextValue {
                  text
                }
              }
            }
          }
        }
      }
    }
  `;
  const itemsData = runGraphQL(itemsQuery, { id: PROJECT_ID });
  const existingMap = new Map();
  for (const it of itemsData.node.items.nodes) {
    const t = it.fieldValueByName?.text;
    if (t) existingMap.set(t, it.id);
  }
  console.log(`Found ${existingMap.size} existing items in project.`);

  // Mutations
  const createMutation = `
    mutation($projectId: ID!, $title: String!, $body: String!) {
      addProjectV2DraftIssue(input: { projectId: $projectId, title: $title, body: $body }) {
        projectItem {
          id
        }
      }
    }
  `;

  const updateMutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: $value
      }) {
        projectV2Item {
          id
        }
      }
    }
  `;

  // 3. Loop through tasks
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const title = `[${t['WBS Ref']}] ${t['Task Name']}`;
    const body = `### Deliverable\n${t['Deliverable'] || 'N/A'}\n\n**WBS Ref:** ${t['WBS Ref']}\n**Phase / Sprint:** ${t['Phase / Sprint']}\n**Priority:** ${t['Priority']}\n**Dates:** ${t['start_date']} to ${t['end_date']}`;

    let itemId = existingMap.get(title);

    if (!itemId) {
      const created = runGraphQL(createMutation, {
        projectId: PROJECT_ID,
        title: title,
        body: body
      });
      itemId = created.addProjectV2DraftIssue.projectItem.id;
      existingMap.set(title, itemId);
    }

    // Set fields
    // A. WBS Ref
    if (fieldMap['WBS Ref'] && t['WBS Ref']) {
      runGraphQL(updateMutation, {
        projectId: PROJECT_ID,
        itemId: itemId,
        fieldId: fieldMap['WBS Ref'].id,
        value: { text: String(t['WBS Ref']) }
      });
    }

    // B. Deliverable
    if (fieldMap['Deliverable'] && t['Deliverable']) {
      runGraphQL(updateMutation, {
        projectId: PROJECT_ID,
        itemId: itemId,
        fieldId: fieldMap['Deliverable'].id,
        value: { text: String(t['Deliverable']) }
      });
    }

    // C. Start Date
    if (fieldMap['Start Date'] && t['start_date']) {
      runGraphQL(updateMutation, {
        projectId: PROJECT_ID,
        itemId: itemId,
        fieldId: fieldMap['Start Date'].id,
        value: { date: String(t['start_date']) }
      });
    }

    // D. End Date
    if (fieldMap['End Date'] && t['end_date']) {
      runGraphQL(updateMutation, {
        projectId: PROJECT_ID,
        itemId: itemId,
        fieldId: fieldMap['End Date'].id,
        value: { date: String(t['end_date']) }
      });
    }

    // E. Progress
    if (fieldMap['Progress'] !== undefined && fieldMap['Progress'] !== null && t['Progress'] !== undefined && t['Progress'] !== null) {
      runGraphQL(updateMutation, {
        projectId: PROJECT_ID,
        itemId: itemId,
        fieldId: fieldMap['Progress'].id,
        value: { number: Math.round(t['Progress'] * 100) }
      });
    }

    // F. Phase / Sprint
    if (fieldMap['Phase / Sprint'] && t['Phase / Sprint']) {
      const opt = fieldMap['Phase / Sprint'].options?.find(o => o.name === t['Phase / Sprint']);
      if (opt) {
        runGraphQL(updateMutation, {
          projectId: PROJECT_ID,
          itemId: itemId,
          fieldId: fieldMap['Phase / Sprint'].id,
          value: { singleSelectOptionId: opt.id }
        });
      }
    }

    // G. Assigned Role
    if (fieldMap['Assigned Role'] && t['Assigned Role']) {
      let roleVal = t['Assigned Role'];
      try {
        const parsed = JSON.parse(roleVal);
        if (Array.isArray(parsed) && parsed.length > 0) roleVal = parsed[0];
      } catch (e) {}
      const opt = fieldMap['Assigned Role'].options?.find(o => o.name === roleVal);
      if (opt) {
        runGraphQL(updateMutation, {
          projectId: PROJECT_ID,
          itemId: itemId,
          fieldId: fieldMap['Assigned Role'].id,
          value: { singleSelectOptionId: opt.id }
        });
      }
    }

    // H. Priority
    if (fieldMap['Priority'] && t['Priority']) {
      const opt = fieldMap['Priority'].options?.find(o => o.name === t['Priority']);
      if (opt) {
        runGraphQL(updateMutation, {
          projectId: PROJECT_ID,
          itemId: itemId,
          fieldId: fieldMap['Priority'].id,
          value: { singleSelectOptionId: opt.id }
        });
      }
    }

    // I. Status
    if (fieldMap['Status'] && t['Status']) {
      let statusName = "Todo";
      if (t['Status'] === 'Done') statusName = "Done";
      else if (t['Status'] === 'Ongoing') statusName = "In Progress";
      else if (t['Status'] === 'Not Started') statusName = "Todo";

      const opt = fieldMap['Status'].options?.find(o => o.name.toLowerCase() === statusName.toLowerCase() || o.name.toLowerCase() === t['Status'].toLowerCase());
      if (opt) {
        runGraphQL(updateMutation, {
          projectId: PROJECT_ID,
          itemId: itemId,
          fieldId: fieldMap['Status'].id,
          value: { singleSelectOptionId: opt.id }
        });
      }
    }

    console.log(`[${i + 1}/${tasks.length}] Synced: ${title}`);
    await sleep(50);
  }

  console.log(`\n🎉 Success! All ${tasks.length} items synced to GitHub Project: https://github.com/orgs/ILT-ALICA/projects/1`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
