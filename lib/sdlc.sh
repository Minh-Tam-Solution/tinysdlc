#!/usr/bin/env bash
# SDLC Framework v6.0.6 commands for TinySDLC
# Sourced by tinyclaw.sh

# Requires: jq, SETTINGS_FILE, SCRIPT_DIR (from common.sh)

# ─── sdlc status ─────────────────────────────────────────────────────────────

sdlc_status() {
    if [ ! -f "$SETTINGS_FILE" ]; then
        echo -e "${RED}No settings file found. Run 'tinysdlc setup' first.${NC}"
        return 1
    fi
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required.${NC}"; return 1
    fi

    echo -e "${BLUE}TinySDLC — SDLC Framework v6.0.6 Status${NC}"
    echo ""

    # Agents with sdlc_role
    echo -e "${GREEN}Agents:${NC}"
    local agents
    agents=$(jq -r '.agents // {} | to_entries[] | "\(.key)|\(.value.name)|\(.value.provider)|\(.value.model)|\(.value.sdlc_role // "-")"' "$SETTINGS_FILE" 2>/dev/null)
    if [ -z "$agents" ]; then
        echo "  (no agents configured)"
    else
        printf "  %-12s %-20s %-12s %-15s %-10s\n" "ID" "Name" "Provider" "Model" "SDLC Role"
        printf "  %-12s %-20s %-12s %-15s %-10s\n" "────────────" "────────────────────" "────────────" "───────────────" "──────────"
        while IFS='|' read -r id name provider model role; do
            printf "  %-12s %-20s %-12s %-15s %-10s\n" "$id" "$name" "$provider" "$model" "$role"
        done <<< "$agents"
    fi
    echo ""

    # Teams
    echo -e "${GREEN}Teams:${NC}"
    local teams
    teams=$(jq -r '.teams // {} | to_entries[] | "\(.key)|\(.value.name)|\(.value.leader_agent)|\(.value.agents | join(","))|\(.value.description // "")"' "$SETTINGS_FILE" 2>/dev/null)
    if [ -z "$teams" ]; then
        echo "  (no teams configured)"
    else
        printf "  %-12s %-20s %-10s %-30s\n" "ID" "Name" "Leader" "Agents"
        printf "  %-12s %-20s %-10s %-30s\n" "────────────" "────────────────────" "──────────" "──────────────────────────────"
        while IFS='|' read -r id name leader agents desc; do
            printf "  %-12s %-20s %-10s %-30s\n" "$id" "$name" "$leader" "$agents"
            if [ -n "$desc" ]; then
                printf "  %-12s ${YELLOW}%s${NC}\n" "" "$desc"
            fi
        done <<< "$teams"
    fi
    echo ""

    # Ollama URL
    local ollama_url
    ollama_url=$(jq -r '.providers.ollama.url // "http://localhost:11434 (default)"' "$SETTINGS_FILE" 2>/dev/null)
    echo -e "${GREEN}Ollama URL:${NC} $ollama_url"
    echo ""
}

# ─── sdlc roles ──────────────────────────────────────────────────────────────

sdlc_roles() {
    echo -e "${BLUE}SDLC Framework v6.0.6 — Role Reference${NC}"
    echo ""
    printf "  %-10s %-20s %-20s %-15s %-30s\n" "Role" "Title" "Stage" "Gate" "Key Constraint"
    printf "  %-10s %-20s %-20s %-15s %-30s\n" "──────────" "────────────────────" "────────────────────" "───────────────" "──────────────────────────────"
    printf "  %-10s %-20s %-20s %-15s %-30s\n" "pm"        "Product Manager"      "00-01 Foundation/Plan" "G0.1, G1"      "No self-approve requirements"
    printf "  %-10s %-20s %-20s %-15s %-30s\n" "architect" "Solution Architect"   "02-03 Design/Integrate" "G2"           "No tech decisions without ADR"
    printf "  %-10s %-20s %-20s %-15s %-30s\n" "coder"     "Developer"            "04 Build"              "Sprint Gate"   "No merge without reviewer"
    printf "  %-10s %-20s %-20s %-15s %-30s\n" "reviewer"  "Code Reviewer"        "04-05 Build/Verify"    "G3 Ship Ready" "NEVER approve own code"
    printf "  %-10s %-20s %-20s %-15s %-30s\n" "tester"    "QA Tester"            "05 Verify"             "G3 (co-owner)" "No skip coverage thresholds"
    printf "  %-10s %-20s %-20s %-15s %-30s\n" "devops"    "DevOps Engineer"      "06-07 Deploy/Operate"  "G4"           "No deploy without G3 confirmed"
    echo ""
    echo -e "SE4H (Human Coach): The user on Telegram/Discord/WhatsApp"
    echo -e "SE4A (Agent Executor): All agents — propose, implement, never self-approve"
    echo ""
}

# ─── sdlc init ───────────────────────────────────────────────────────────────

sdlc_init() {
    local template="$SCRIPT_DIR/templates/settings.sdlc-default.json"

    if [ ! -f "$template" ]; then
        echo -e "${RED}SDLC template not found: $template${NC}"
        return 1
    fi

    if [ ! -f "$SETTINGS_FILE" ]; then
        echo -e "${RED}No settings file found. Run 'tinysdlc setup' first to configure channels.${NC}"
        return 1
    fi

    echo -e "${BLUE}TinySDLC SDLC Init — applying SDLC Framework v6.0.6 defaults${NC}"
    echo ""
    echo "This will add the following to your settings.json:"
    echo "  Agents: pm, architect, coder, reviewer, tester, devops"
    echo "  Teams:  planning, dev, qa, fullstack"
    echo ""
    echo -n "Continue? (y/n) "
    read -r confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Aborted."
        return 0
    fi

    # Merge SDLC agents into existing settings (preserve channels, tokens, existing agents)
    local tmp_file="${SETTINGS_FILE}.sdlc_init_tmp"

    # Use jq to deep-merge: existing settings take precedence for channels/tokens,
    # SDLC template provides agents/teams (merged, existing agents preserved)
    jq -s '
        .[0] as $existing |
        .[1] as $template |
        $existing * {
            "agents": ($template.agents + ($existing.agents // {})),
            "teams": ($template.teams + ($existing.teams // {})),
            "providers": ($template.providers * ($existing.providers // {}))
        }
    ' "$SETTINGS_FILE" "$template" > "$tmp_file" 2>/dev/null

    if [ $? -ne 0 ]; then
        echo -e "${RED}Error merging settings. Check jq is installed.${NC}"
        rm -f "$tmp_file"
        return 1
    fi

    # Backup and replace
    cp "$SETTINGS_FILE" "${SETTINGS_FILE}.bak"
    mv "$tmp_file" "$SETTINGS_FILE"

    echo -e "${GREEN}Done!${NC} SDLC agents and teams added to settings.json"
    echo -e "  Backup saved to: ${SETTINGS_FILE}.bak"
    echo ""
    echo "Next steps:"
    echo "  1. tinysdlc sdlc status     — verify configuration"
    echo "  2. tinysdlc start           — (re)start TinySDLC"
    echo "  3. Message '@planning ...'  — activate the planning team"
    echo "  4. Message '@dev ...'       — activate the development team"
    echo ""

    # Create workspace directories
    local workspace
    workspace=$(jq -r '.workspace.path // ""' "$SETTINGS_FILE" 2>/dev/null)
    workspace="${workspace/#\~/$HOME}"
    if [ -n "$workspace" ]; then
        for role in pm architect coder reviewer tester devops; do
            mkdir -p "$workspace/$role"
        done
        echo -e "${GREEN}Workspace directories created:${NC} $workspace/{pm,architect,coder,reviewer,tester,devops}"
    fi
}

# ─── sdlc reinit ─────────────────────────────────────────────────────────────

sdlc_reinit() {
    if [ ! -f "$SETTINGS_FILE" ]; then
        echo -e "${RED}No settings file found. Run 'tinysdlc setup' first.${NC}"
        return 1
    fi

    local target_agent="${1:-}"
    local workspace
    workspace=$(jq -r '.workspace.path // ""' "$SETTINGS_FILE" 2>/dev/null)
    workspace="${workspace/#\~/$HOME}"

    # Collect agents to reinit
    local agent_ids
    if [ -n "$target_agent" ]; then
        # Validate agent exists
        if ! jq -e ".agents[\"$target_agent\"]" "$SETTINGS_FILE" &>/dev/null; then
            echo -e "${RED}Agent '$target_agent' not found in settings.json${NC}"
            return 1
        fi
        agent_ids="$target_agent"
    else
        agent_ids=$(jq -r '.agents | keys[]' "$SETTINGS_FILE" 2>/dev/null)
    fi

    echo -e "${BLUE}TinySDLC SDLC Reinit — applying role templates to agent directories${NC}"
    echo ""

    while IFS= read -r agent_id; do
        local role working_dir
        role=$(jq -r ".agents[\"$agent_id\"].sdlc_role // \"\"" "$SETTINGS_FILE" 2>/dev/null)
        working_dir=$(jq -r ".agents[\"$agent_id\"].working_directory // \"\"" "$SETTINGS_FILE" 2>/dev/null)
        working_dir="${working_dir/#\~/$HOME}"

        # Resolve relative paths
        if [[ "$working_dir" != /* ]]; then
            working_dir="$workspace/$working_dir"
        fi

        if [ -z "$working_dir" ]; then
            working_dir="$workspace/$agent_id"
        fi

        # Select template
        local template_src="$SCRIPT_DIR/AGENTS.md"
        if [ -n "$role" ]; then
            local role_template="$SCRIPT_DIR/templates/agents/$role/AGENTS.md"
            if [ -f "$role_template" ]; then
                template_src="$role_template"
            fi
        fi

        mkdir -p "$working_dir/.claude" "$working_dir/.tinyclaw"

        if [ -f "$template_src" ]; then
            cp "$template_src" "$working_dir/AGENTS.md"
            cp "$template_src" "$working_dir/.claude/CLAUDE.md"
        fi

        if [ -f "$SCRIPT_DIR/heartbeat.md" ]; then
            cp "$SCRIPT_DIR/heartbeat.md" "$working_dir/heartbeat.md"
        fi

        if [ -f "$SCRIPT_DIR/SOUL.md" ]; then
            cp "$SCRIPT_DIR/SOUL.md" "$working_dir/.tinysdlc/SOUL.md"
        fi

        local role_label="${role:-(no role)}"
        printf "  %-12s %-12s %s\\n" "$agent_id" "[$role_label]" "$working_dir"
    done <<< "$agent_ids"

    echo ""
    echo -e "${GREEN}Done!${NC} Run 'tinysdlc sdlc status' to verify."
}

# ─── sdlc command dispatch ───────────────────────────────────────────────────

sdlc_command() {
    case "${1:-}" in
        status)
            sdlc_status
            ;;
        roles)
            sdlc_roles
            ;;
        init)
            sdlc_init
            ;;
        reinit)
            shift
            sdlc_reinit "$@"
            ;;
        *)
            echo "Usage: tinysdlc sdlc {status|roles|init|reinit}"
            echo ""
            echo "Commands:"
            echo "  status          Show agents with SDLC roles and active teams"
            echo "  roles           List all 6 SDLC roles with stage and gate mapping"
            echo "  init            Apply SDLC default agents/teams to settings.json"
            echo "  reinit [agent]  Re-apply role templates to agent working directories"
            echo ""
            echo "Examples:"
            echo "  tinysdlc sdlc status"
            echo "  tinysdlc sdlc roles"
            echo "  tinysdlc sdlc init"
            echo "  tinysdlc sdlc reinit           # reinit all agents"
            echo "  tinysdlc sdlc reinit coder     # reinit specific agent"
            ;;
    esac
}
