import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

// 有里程碑的任务存放在以里程碑文件名命名的子目录里，没有里程碑的任务与已有的平铺任务照常读写。
describe("task milestone folders", () => {
	let testDir: string;
	let core: Core;

	beforeEach(async () => {
		testDir = createUniqueTestDir("test-task-milestone-folders");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Task Milestone Folders");
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("keeps a task without a milestone flat", async () => {
		const { filePath } = await core.createTaskFromInput({ title: "Loose" }, false);
		expect(filePath).toBe(join(core.filesystem.tasksDir, "task-1 - Loose.md"));
		expect(await core.archiveTask("task-1", false)).toBe(true);
		expect((await core.getTask("task-1"))?.filePath).toBe(join(core.filesystem.archiveTasksDir, "task-1 - Loose.md"));
	});

	it("reads an existing flat task with a milestone and moves it into the folder on its next save", async () => {
		const milestone = await core.filesystem.createMilestone("Release 1");
		await core.createTaskFromInput({ title: "Ship it", milestone: milestone.id }, false);
		const filePath = join(core.filesystem.tasksDir, "m-0 - release-1", "task-1 - Ship-it.md");
		const flatPath = join(core.filesystem.tasksDir, "task-1 - Ship-it.md");
		await rename(filePath, flatPath);
		core = new Core(testDir);

		expect((await core.getTask("task-1"))?.filePath).toBe(flatPath);
		await core.updateTaskFromInput("task-1", { status: "In Progress" }, false);
		expect((await core.getTask("task-1"))?.filePath).toBe(filePath);
		expect(await Bun.file(flatPath).exists()).toBe(false);
	});

	it("writes a task with a milestone into the milestone folder and still finds it by ID", async () => {
		const milestone = await core.filesystem.createMilestone("Release 1");
		const { filePath } = await core.createTaskFromInput({ title: "Ship it", milestone: milestone.id }, false);

		expect(filePath).toBe(join(core.filesystem.tasksDir, "m-0 - release-1", "task-1 - Ship-it.md"));
		expect((await core.filesystem.listTasks()).map((task) => task.id)).toEqual(["TASK-1"]);
		expect((await core.getTask("task-1"))?.filePath).toBe(filePath);
		expect((await core.createTaskFromInput({ title: "Next" }, false)).task.id).toBe("TASK-2");
	});

	it("moves the file when the milestone changes or is cleared", async () => {
		const first = await core.filesystem.createMilestone("Release 1");
		const second = await core.filesystem.createMilestone("Release 2");
		await core.createTaskFromInput({ title: "Ship it", milestone: first.id }, false);

		await core.updateTaskFromInput("task-1", { milestone: second.id }, false);
		expect((await core.getTask("task-1"))?.filePath).toBe(
			join(core.filesystem.tasksDir, "m-1 - release-2", "task-1 - Ship-it.md"),
		);
		expect(await Bun.file(join(core.filesystem.tasksDir, "m-0 - release-1", "task-1 - Ship-it.md")).exists()).toBe(
			false,
		);

		await core.updateTaskFromInput("task-1", { milestone: null }, false);
		expect((await core.getTask("task-1"))?.filePath).toBe(join(core.filesystem.tasksDir, "task-1 - Ship-it.md"));
		expect((await core.filesystem.listTasks()).map((task) => task.id)).toEqual(["TASK-1"]);
	});

	it("keeps the milestone folder through archive and restore", async () => {
		const milestone = await core.filesystem.createMilestone("Release 1");
		await core.createTaskFromInput({ title: "Ship it", milestone: milestone.id }, false);

		expect(await core.archiveTask("task-1", false)).toBe(true);
		const archived = await core.getTask("task-1");
		expect(archived?.source).toBe("archived");
		expect(archived?.filePath).toBe(join(core.filesystem.archiveTasksDir, "m-0 - release-1", "task-1 - Ship-it.md"));

		expect(await core.restoreTask("task-1", false)).toBe(true);
		expect((await core.getTask("task-1"))?.filePath).toBe(
			join(core.filesystem.tasksDir, "m-0 - release-1", "task-1 - Ship-it.md"),
		);
	});

	it("renames the task folder with the milestone", async () => {
		const milestone = await core.filesystem.createMilestone("Release 1");
		await core.createTaskFromInput({ title: "Ship it", milestone: milestone.id }, false);

		expect((await core.renameMilestone(milestone.id, "Launch", false)).success).toBe(true);
		expect((await core.getTask("task-1"))?.filePath).toBe(
			join(core.filesystem.tasksDir, "m-0 - launch", "task-1 - Ship-it.md"),
		);
	});
});
