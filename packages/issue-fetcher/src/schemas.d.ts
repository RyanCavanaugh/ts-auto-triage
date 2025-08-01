import { z } from 'zod';
export declare const ReactionSchema: z.ZodObject<{
    '+1': z.ZodNumber;
    '-1': z.ZodNumber;
    laugh: z.ZodNumber;
    hooray: z.ZodNumber;
    confused: z.ZodNumber;
    heart: z.ZodNumber;
    rocket: z.ZodNumber;
    eyes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    '+1': number;
    '-1': number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
}, {
    '+1': number;
    '-1': number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
}>;
export declare const UserSchema: z.ZodObject<{
    login: z.ZodString;
    id: z.ZodNumber;
    type: z.ZodString;
    site_admin: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: number;
    login: string;
    site_admin: boolean;
}, {
    type: string;
    id: number;
    login: string;
    site_admin: boolean;
}>;
export declare const LabelSchema: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    color: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: number;
    name: string;
    color: string;
    description: string | null;
}, {
    id: number;
    name: string;
    color: string;
    description: string | null;
}>;
export declare const MilestoneSchema: z.ZodObject<{
    id: z.ZodNumber;
    number: z.ZodNumber;
    title: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    state: z.ZodEnum<["open", "closed"]>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    due_on: z.ZodNullable<z.ZodString>;
    closed_at: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    number: number;
    id: number;
    description: string | null;
    title: string;
    state: "open" | "closed";
    created_at: string;
    updated_at: string;
    due_on: string | null;
    closed_at: string | null;
}, {
    number: number;
    id: number;
    description: string | null;
    title: string;
    state: "open" | "closed";
    created_at: string;
    updated_at: string;
    due_on: string | null;
    closed_at: string | null;
}>;
export declare const CommentSchema: z.ZodObject<{
    id: z.ZodNumber;
    user: z.ZodObject<{
        login: z.ZodString;
        id: z.ZodNumber;
        type: z.ZodString;
        site_admin: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    body: z.ZodString;
    reactions: z.ZodObject<{
        '+1': z.ZodNumber;
        '-1': z.ZodNumber;
        laugh: z.ZodNumber;
        hooray: z.ZodNumber;
        confused: z.ZodNumber;
        heart: z.ZodNumber;
        rocket: z.ZodNumber;
        eyes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        '+1': number;
        '-1': number;
        laugh: number;
        hooray: number;
        confused: number;
        heart: number;
        rocket: number;
        eyes: number;
    }, {
        '+1': number;
        '-1': number;
        laugh: number;
        hooray: number;
        confused: number;
        heart: number;
        rocket: number;
        eyes: number;
    }>;
    author_association: z.ZodString;
}, "strip", z.ZodTypeAny, {
    user: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    };
    id: number;
    created_at: string;
    updated_at: string;
    body: string;
    reactions: {
        '+1': number;
        '-1': number;
        laugh: number;
        hooray: number;
        confused: number;
        heart: number;
        rocket: number;
        eyes: number;
    };
    author_association: string;
}, {
    user: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    };
    id: number;
    created_at: string;
    updated_at: string;
    body: string;
    reactions: {
        '+1': number;
        '-1': number;
        laugh: number;
        hooray: number;
        confused: number;
        heart: number;
        rocket: number;
        eyes: number;
    };
    author_association: string;
}>;
export declare const EventSchema: z.ZodObject<{
    id: z.ZodNumber;
    event: z.ZodString;
    created_at: z.ZodString;
    actor: z.ZodNullable<z.ZodObject<{
        login: z.ZodString;
        id: z.ZodNumber;
        type: z.ZodString;
        site_admin: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }>>;
    label: z.ZodNullable<z.ZodObject<{
        id: z.ZodNumber;
        name: z.ZodString;
        color: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        name: string;
        color: string;
        description: string | null;
    }, {
        id: number;
        name: string;
        color: string;
        description: string | null;
    }>>;
    assignee: z.ZodNullable<z.ZodObject<{
        login: z.ZodString;
        id: z.ZodNumber;
        type: z.ZodString;
        site_admin: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }>>;
    milestone: z.ZodNullable<z.ZodObject<{
        id: z.ZodNumber;
        number: z.ZodNumber;
        title: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        state: z.ZodEnum<["open", "closed"]>;
        created_at: z.ZodString;
        updated_at: z.ZodString;
        due_on: z.ZodNullable<z.ZodString>;
        closed_at: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        number: number;
        id: number;
        description: string | null;
        title: string;
        state: "open" | "closed";
        created_at: string;
        updated_at: string;
        due_on: string | null;
        closed_at: string | null;
    }, {
        number: number;
        id: number;
        description: string | null;
        title: string;
        state: "open" | "closed";
        created_at: string;
        updated_at: string;
        due_on: string | null;
        closed_at: string | null;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: number;
    label: {
        id: number;
        name: string;
        color: string;
        description: string | null;
    } | null;
    created_at: string;
    event: string;
    actor: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    } | null;
    assignee: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    } | null;
    milestone: {
        number: number;
        id: number;
        description: string | null;
        title: string;
        state: "open" | "closed";
        created_at: string;
        updated_at: string;
        due_on: string | null;
        closed_at: string | null;
    } | null;
}, {
    id: number;
    label: {
        id: number;
        name: string;
        color: string;
        description: string | null;
    } | null;
    created_at: string;
    event: string;
    actor: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    } | null;
    assignee: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    } | null;
    milestone: {
        number: number;
        id: number;
        description: string | null;
        title: string;
        state: "open" | "closed";
        created_at: string;
        updated_at: string;
        due_on: string | null;
        closed_at: string | null;
    } | null;
}>;
export declare const IssueSchema: z.ZodObject<{
    id: z.ZodNumber;
    number: z.ZodNumber;
    title: z.ZodString;
    body: z.ZodNullable<z.ZodString>;
    user: z.ZodObject<{
        login: z.ZodString;
        id: z.ZodNumber;
        type: z.ZodString;
        site_admin: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }>;
    labels: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        name: z.ZodString;
        color: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        name: string;
        color: string;
        description: string | null;
    }, {
        id: number;
        name: string;
        color: string;
        description: string | null;
    }>, "many">;
    state: z.ZodEnum<["open", "closed"]>;
    locked: z.ZodBoolean;
    assignee: z.ZodNullable<z.ZodObject<{
        login: z.ZodString;
        id: z.ZodNumber;
        type: z.ZodString;
        site_admin: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }>>;
    assignees: z.ZodArray<z.ZodObject<{
        login: z.ZodString;
        id: z.ZodNumber;
        type: z.ZodString;
        site_admin: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }, {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }>, "many">;
    milestone: z.ZodNullable<z.ZodObject<{
        id: z.ZodNumber;
        number: z.ZodNumber;
        title: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        state: z.ZodEnum<["open", "closed"]>;
        created_at: z.ZodString;
        updated_at: z.ZodString;
        due_on: z.ZodNullable<z.ZodString>;
        closed_at: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        number: number;
        id: number;
        description: string | null;
        title: string;
        state: "open" | "closed";
        created_at: string;
        updated_at: string;
        due_on: string | null;
        closed_at: string | null;
    }, {
        number: number;
        id: number;
        description: string | null;
        title: string;
        state: "open" | "closed";
        created_at: string;
        updated_at: string;
        due_on: string | null;
        closed_at: string | null;
    }>>;
    comments: z.ZodNumber;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    closed_at: z.ZodNullable<z.ZodString>;
    author_association: z.ZodString;
    reactions: z.ZodObject<{
        '+1': z.ZodNumber;
        '-1': z.ZodNumber;
        laugh: z.ZodNumber;
        hooray: z.ZodNumber;
        confused: z.ZodNumber;
        heart: z.ZodNumber;
        rocket: z.ZodNumber;
        eyes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        '+1': number;
        '-1': number;
        laugh: number;
        hooray: number;
        confused: number;
        heart: number;
        rocket: number;
        eyes: number;
    }, {
        '+1': number;
        '-1': number;
        laugh: number;
        hooray: number;
        confused: number;
        heart: number;
        rocket: number;
        eyes: number;
    }>;
    pull_request: z.ZodNullable<z.ZodObject<{
        url: z.ZodString;
        html_url: z.ZodString;
        diff_url: z.ZodString;
        patch_url: z.ZodString;
        merged_at: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        html_url: string;
        diff_url: string;
        patch_url: string;
        merged_at: string | null;
    }, {
        url: string;
        html_url: string;
        diff_url: string;
        patch_url: string;
        merged_at: string | null;
    }>>;
    comments_data: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        user: z.ZodObject<{
            login: z.ZodString;
            id: z.ZodNumber;
            type: z.ZodString;
            site_admin: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        }, {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        }>;
        created_at: z.ZodString;
        updated_at: z.ZodString;
        body: z.ZodString;
        reactions: z.ZodObject<{
            '+1': z.ZodNumber;
            '-1': z.ZodNumber;
            laugh: z.ZodNumber;
            hooray: z.ZodNumber;
            confused: z.ZodNumber;
            heart: z.ZodNumber;
            rocket: z.ZodNumber;
            eyes: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            '+1': number;
            '-1': number;
            laugh: number;
            hooray: number;
            confused: number;
            heart: number;
            rocket: number;
            eyes: number;
        }, {
            '+1': number;
            '-1': number;
            laugh: number;
            hooray: number;
            confused: number;
            heart: number;
            rocket: number;
            eyes: number;
        }>;
        author_association: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        user: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        };
        id: number;
        created_at: string;
        updated_at: string;
        body: string;
        reactions: {
            '+1': number;
            '-1': number;
            laugh: number;
            hooray: number;
            confused: number;
            heart: number;
            rocket: number;
            eyes: number;
        };
        author_association: string;
    }, {
        user: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        };
        id: number;
        created_at: string;
        updated_at: string;
        body: string;
        reactions: {
            '+1': number;
            '-1': number;
            laugh: number;
            hooray: number;
            confused: number;
            heart: number;
            rocket: number;
            eyes: number;
        };
        author_association: string;
    }>, "many">;
    events_data: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        event: z.ZodString;
        created_at: z.ZodString;
        actor: z.ZodNullable<z.ZodObject<{
            login: z.ZodString;
            id: z.ZodNumber;
            type: z.ZodString;
            site_admin: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        }, {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        }>>;
        label: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            name: z.ZodString;
            color: z.ZodString;
            description: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            id: number;
            name: string;
            color: string;
            description: string | null;
        }, {
            id: number;
            name: string;
            color: string;
            description: string | null;
        }>>;
        assignee: z.ZodNullable<z.ZodObject<{
            login: z.ZodString;
            id: z.ZodNumber;
            type: z.ZodString;
            site_admin: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        }, {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        }>>;
        milestone: z.ZodNullable<z.ZodObject<{
            id: z.ZodNumber;
            number: z.ZodNumber;
            title: z.ZodString;
            description: z.ZodNullable<z.ZodString>;
            state: z.ZodEnum<["open", "closed"]>;
            created_at: z.ZodString;
            updated_at: z.ZodString;
            due_on: z.ZodNullable<z.ZodString>;
            closed_at: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            number: number;
            id: number;
            description: string | null;
            title: string;
            state: "open" | "closed";
            created_at: string;
            updated_at: string;
            due_on: string | null;
            closed_at: string | null;
        }, {
            number: number;
            id: number;
            description: string | null;
            title: string;
            state: "open" | "closed";
            created_at: string;
            updated_at: string;
            due_on: string | null;
            closed_at: string | null;
        }>>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        label: {
            id: number;
            name: string;
            color: string;
            description: string | null;
        } | null;
        created_at: string;
        event: string;
        actor: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        } | null;
        assignee: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        } | null;
        milestone: {
            number: number;
            id: number;
            description: string | null;
            title: string;
            state: "open" | "closed";
            created_at: string;
            updated_at: string;
            due_on: string | null;
            closed_at: string | null;
        } | null;
    }, {
        id: number;
        label: {
            id: number;
            name: string;
            color: string;
            description: string | null;
        } | null;
        created_at: string;
        event: string;
        actor: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        } | null;
        assignee: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        } | null;
        milestone: {
            number: number;
            id: number;
            description: string | null;
            title: string;
            state: "open" | "closed";
            created_at: string;
            updated_at: string;
            due_on: string | null;
            closed_at: string | null;
        } | null;
    }>, "many">;
    is_pull_request: z.ZodBoolean;
    repo_owner: z.ZodString;
    repo_name: z.ZodString;
    fetched_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    number: number;
    user: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    };
    id: number;
    title: string;
    state: "open" | "closed";
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    body: string | null;
    reactions: {
        '+1': number;
        '-1': number;
        laugh: number;
        hooray: number;
        confused: number;
        heart: number;
        rocket: number;
        eyes: number;
    };
    author_association: string;
    assignee: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    } | null;
    milestone: {
        number: number;
        id: number;
        description: string | null;
        title: string;
        state: "open" | "closed";
        created_at: string;
        updated_at: string;
        due_on: string | null;
        closed_at: string | null;
    } | null;
    labels: {
        id: number;
        name: string;
        color: string;
        description: string | null;
    }[];
    locked: boolean;
    assignees: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }[];
    comments: number;
    pull_request: {
        url: string;
        html_url: string;
        diff_url: string;
        patch_url: string;
        merged_at: string | null;
    } | null;
    comments_data: {
        user: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        };
        id: number;
        created_at: string;
        updated_at: string;
        body: string;
        reactions: {
            '+1': number;
            '-1': number;
            laugh: number;
            hooray: number;
            confused: number;
            heart: number;
            rocket: number;
            eyes: number;
        };
        author_association: string;
    }[];
    events_data: {
        id: number;
        label: {
            id: number;
            name: string;
            color: string;
            description: string | null;
        } | null;
        created_at: string;
        event: string;
        actor: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        } | null;
        assignee: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        } | null;
        milestone: {
            number: number;
            id: number;
            description: string | null;
            title: string;
            state: "open" | "closed";
            created_at: string;
            updated_at: string;
            due_on: string | null;
            closed_at: string | null;
        } | null;
    }[];
    is_pull_request: boolean;
    repo_owner: string;
    repo_name: string;
    fetched_at: string;
}, {
    number: number;
    user: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    };
    id: number;
    title: string;
    state: "open" | "closed";
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    body: string | null;
    reactions: {
        '+1': number;
        '-1': number;
        laugh: number;
        hooray: number;
        confused: number;
        heart: number;
        rocket: number;
        eyes: number;
    };
    author_association: string;
    assignee: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    } | null;
    milestone: {
        number: number;
        id: number;
        description: string | null;
        title: string;
        state: "open" | "closed";
        created_at: string;
        updated_at: string;
        due_on: string | null;
        closed_at: string | null;
    } | null;
    labels: {
        id: number;
        name: string;
        color: string;
        description: string | null;
    }[];
    locked: boolean;
    assignees: {
        type: string;
        id: number;
        login: string;
        site_admin: boolean;
    }[];
    comments: number;
    pull_request: {
        url: string;
        html_url: string;
        diff_url: string;
        patch_url: string;
        merged_at: string | null;
    } | null;
    comments_data: {
        user: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        };
        id: number;
        created_at: string;
        updated_at: string;
        body: string;
        reactions: {
            '+1': number;
            '-1': number;
            laugh: number;
            hooray: number;
            confused: number;
            heart: number;
            rocket: number;
            eyes: number;
        };
        author_association: string;
    }[];
    events_data: {
        id: number;
        label: {
            id: number;
            name: string;
            color: string;
            description: string | null;
        } | null;
        created_at: string;
        event: string;
        actor: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        } | null;
        assignee: {
            type: string;
            id: number;
            login: string;
            site_admin: boolean;
        } | null;
        milestone: {
            number: number;
            id: number;
            description: string | null;
            title: string;
            state: "open" | "closed";
            created_at: string;
            updated_at: string;
            due_on: string | null;
            closed_at: string | null;
        } | null;
    }[];
    is_pull_request: boolean;
    repo_owner: string;
    repo_name: string;
    fetched_at: string;
}>;
export declare const IssueRefSchema: z.ZodObject<{
    owner: z.ZodString;
    repo: z.ZodString;
    number: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    number: number;
    owner: string;
    repo: string;
}, {
    number: number;
    owner: string;
    repo: string;
}>;
export declare const ActionSchema: z.ZodObject<{
    kind: z.ZodEnum<["add_label", "remove_label", "close", "comment", "assign", "unassign"]>;
    label: z.ZodOptional<z.ZodString>;
    comment: z.ZodOptional<z.ZodString>;
    assignee: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "close" | "add_label" | "remove_label" | "comment" | "assign" | "unassign";
    label?: string | undefined;
    assignee?: string | undefined;
    comment?: string | undefined;
}, {
    kind: "close" | "add_label" | "remove_label" | "comment" | "assign" | "unassign";
    label?: string | undefined;
    assignee?: string | undefined;
    comment?: string | undefined;
}>;
export declare const ActionFileSchema: z.ZodObject<{
    issue_ref: z.ZodObject<{
        owner: z.ZodString;
        repo: z.ZodString;
        number: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        number: number;
        owner: string;
        repo: string;
    }, {
        number: number;
        owner: string;
        repo: string;
    }>;
    actions: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["add_label", "remove_label", "close", "comment", "assign", "unassign"]>;
        label: z.ZodOptional<z.ZodString>;
        comment: z.ZodOptional<z.ZodString>;
        assignee: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "close" | "add_label" | "remove_label" | "comment" | "assign" | "unassign";
        label?: string | undefined;
        assignee?: string | undefined;
        comment?: string | undefined;
    }, {
        kind: "close" | "add_label" | "remove_label" | "comment" | "assign" | "unassign";
        label?: string | undefined;
        assignee?: string | undefined;
        comment?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    issue_ref: {
        number: number;
        owner: string;
        repo: string;
    };
    actions: {
        kind: "close" | "add_label" | "remove_label" | "comment" | "assign" | "unassign";
        label?: string | undefined;
        assignee?: string | undefined;
        comment?: string | undefined;
    }[];
}, {
    issue_ref: {
        number: number;
        owner: string;
        repo: string;
    };
    actions: {
        kind: "close" | "add_label" | "remove_label" | "comment" | "assign" | "unassign";
        label?: string | undefined;
        assignee?: string | undefined;
        comment?: string | undefined;
    }[];
}>;
export type Reaction = z.infer<typeof ReactionSchema>;
export type User = z.infer<typeof UserSchema>;
export type Label = z.infer<typeof LabelSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type IssueRef = z.infer<typeof IssueRefSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ActionFile = z.infer<typeof ActionFileSchema>;
//# sourceMappingURL=schemas.d.ts.map