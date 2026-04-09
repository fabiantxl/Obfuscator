-- // Configuración de la Librería Obsidian
local repo = "https://raw.githubusercontent.com/deividcomsono/Obsidian/main/"
local Library = loadstring(game:HttpGet(repo .. "Library.lua"))()
local ThemeManager = loadstring(game:HttpGet(repo .. "addons/ThemeManager.lua"))()
local SaveManager = loadstring(game:HttpGet(repo .. "addons/SaveManager.lua"))()

-- // Ventana Principal
local Window = Library:CreateWindow({
    Title = "The Button",
    Footer = "by Fabianstyx",
    Icon = 711777336,
    NotifySide = "Right",
    ShowCustomCursor = true,
})

-- // Definición de Tabs
local Tabs = {
    Main = Window:AddTab("Main", "command"),
    Esp = Window:AddTab("ESP", "annoyed"),
    Misc = Window:AddTab("Misc", "stretch-horizontal"),
    ["UI Settings"] = Window:AddTab("UI Settings", "settings"),
    
}

-- // Variables de entorno y servicios
local Options = Library.Options
local Toggles = Library.Toggles
local players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")


local plr = players.LocalPlayer
local char = plr.Character or plr.CharacterAdded:Wait()
local hum = char:WaitForChild("Humanoid")

-- // --- FUNCIONES LÓGICAS (ESP E ÍTEMS) ---

local function clearESP()
    for _, item in pairs(workspace:GetDescendants()) do
        if item.Name == "ESP_Folder" then
            item:Destroy()
        end
    end
end

local function createESP(obj)
    local toolType = obj:GetAttribute("ToolType")
    if toolType and obj then
        local folder = obj:FindFirstChild("ESP_Folder")
        if not folder then
            folder = Instance.new("Folder")
            folder.Name = "ESP_Folder"
            folder.Parent = obj

            local bgui = Instance.new("BillboardGui")
            bgui.Name = "NameESP"
            bgui.Size = UDim2.new(0, 200, 0, 50)
            bgui.StudsOffset = Vector3.new(0, 3, 0)
            bgui.AlwaysOnTop = true
            bgui.Parent = folder
            bgui.Adornee = obj
            
            local text = Instance.new("TextLabel")
            text.Size = UDim2.new(1, 0, 1, 0)
            text.BackgroundTransparency = 1
            text.TextColor3 = Color3.fromRGB(255, 0, 0)
            text.TextStrokeTransparency = 0
            text.Text = obj.Name .. " : " .. tostring(toolType)
            text.Parent = bgui
            
            local highlight = Instance.new("Highlight")
            highlight.Name = "ToolHighlight"
            highlight.FillColor = Color3.fromRGB(255, 0, 0)
            highlight.OutlineColor = Color3.fromRGB(255, 255, 255)
            highlight.OutlineTransparency = 1
            highlight.Parent = folder
            highlight.Adornee = obj
            highlight.FillTransparency = 0.7
        end
    end
end

local function createPlayerESP(player)
    if not player.Character then return end
    local folder = player.Character:FindFirstChild("PlayerESP_Folder")
    
    if not folder then
        folder = Instance.new("Folder")
        folder.Name = "PlayerESP_Folder"
        folder.Parent = player.Character

        local bgui = Instance.new("BillboardGui")
        bgui.Name = "NameESP"
        bgui.Size = UDim2.new(0, 200, 0, 50)
        bgui.StudsOffset = Vector3.new(0, 3, 0)
        bgui.AlwaysOnTop = true
        bgui.Parent = folder
        bgui.Adornee = player.Character
        
        local text = Instance.new("TextLabel")
        text.Name = "TextLabel" -- Mantenemos referencia para el update loop
        text.Size = UDim2.new(1, 0, 1, 0)
        text.BackgroundTransparency = 1
        text.TextColor3 = Color3.fromRGB(0, 255, 0)
        text.TextStrokeTransparency = 0
        text.Font = Enum.Font.Arcade -- Mantenemos el estilo retro
        text.TextSize = 14
        text.Parent = bgui
        
        -- Lógica de actualización de texto (Nombre, Vida y Distancia)
        local function updateText()
            local character = player.Character
            local lplr = game.Players.LocalPlayer
            local humanoid = character and character:FindFirstChildWhichIsA("Humanoid")
            local rootPart = character and character:FindFirstChild("HumanoidRootPart")
            local lplrRoot = lplr.Character and lplr.Character:FindFirstChild("HumanoidRootPart")

            if humanoid and rootPart and lplrRoot then
                local health = math.floor(humanoid.Health)
                local distance = math.floor((lplrRoot.Position - rootPart.Position).Magnitude)
                
                -- Formato: Nombre : Vida : Distancia
                text.Text = string.format("%s : %d HP : [%d m]", player.Name, health, distance)
                
                -- Color dinámico según la vida (Verde a Rojo)
                local hpPercent = humanoid.Health / humanoid.MaxHealth
                text.TextColor3 = Color3.fromHSV(hpPercent * 0.33, 0.8, 1)
            end
        end

        -- Conexiones para que sea fluido
        local hum = player.Character:FindFirstChildWhichIsA("Humanoid")
        if hum then
            hum.HealthChanged:Connect(updateText)
            -- Actualizar distancia periódicamente
            task.spawn(function()
                while folder.Parent do
                    updateText()
                    task.wait(0.1)
                end
            end)
        end
        
        -- Highlight original
        local highlight = Instance.new("Highlight")
        highlight.Name = "PlayerHighlight"
        highlight.FillColor = Color3.fromRGB(0, 255, 0)
        highlight.OutlineColor = Color3.fromRGB(255, 255, 255)
        highlight.FillTransparency = 0.7
        highlight.OutlineTransparency = 1
        highlight.Parent = folder
        highlight.Adornee = player.Character
    end
end


local function clearPlayerESP()
    for _, esp in pairs(workspace:GetDescendants()) do
        if esp.Name == "PlayerESP_Folder" then
            esp:Destroy()
        end
    end
end

local lastPos
local function getItems()
    local rootPart = char:FindFirstChild("HumanoidRootPart")
    if not rootPart then return end
    lastPos = rootPart.CFrame
    for _, item in pairs(workspace:GetChildren()) do
        if item:GetAttribute("ToolType") then
            for _, trigger in pairs(item:GetDescendants()) do
                if trigger:IsA("ProximityPrompt") and trigger.Name == "DropPrompt" then
                    rootPart.CFrame = trigger.Parent.CFrame + Vector3.new(0, 3, 0)
                    task.wait(.5)
                    fireproximityprompt(trigger, trigger.MaxActivationDistance)
                    task.wait(.5)
                end
            end
        end
    end
    rootPart.CFrame = lastPos
end

-- // --- CONSTRUCCIÓN DE LA INTERFAZ ---

-- SECCIÓN MAIN
local MainLeft = Tabs.Main:AddLeftGroupbox("Main Features")
local MainRight = Tabs.Main:AddRightGroupbox("Utilities")

MainLeft:AddToggle("SpeedBoost", { Text = "Speed Boost", Default = false }):OnChanged(function()
    if Toggles.SpeedBoost.Value then
        _G.tpwalk = RunService.Heartbeat:Connect(function(delta)
            if char and hum and hum.Parent and hum.MoveDirection.Magnitude > 0 then
                char:TranslateBy(hum.MoveDirection * 2.3 * delta * 10)
            end
        end)
    else
        if _G.tpwalk then _G.tpwalk:Disconnect() end
    end
end)

MainLeft:AddToggle("Noclip", { Text = "Noclip", Default = false }):OnChanged(function()
    if Toggles.Noclip.Value then
        _G.Noclipping = RunService.Stepped:Connect(function()
            if char then
                for _, child in pairs(char:GetDescendants()) do
                    if child:IsA("BasePart") then child.CanCollide = false end
                end
            end
        end)
    else
        if _G.Noclipping then _G.Noclipping:Disconnect() end
    end
end)

MainLeft:AddToggle("RmvFallDamage", { Text = "Remove FallDamage", Default = false }):OnChanged(function()
    local falldamage = char:FindFirstChild("FallDamage")
    if falldamage then falldamage.Enabled = not Toggles.RmvFallDamage.Value end
end)

MainLeft:AddToggle("ItemAura", { Text = "Item Aura", Default = false })
task.spawn(function()
    while task.wait(.3) do
        if Toggles.ItemAura and Toggles.ItemAura.Value then
            for _, item in pairs(workspace:GetChildren()) do
                if item:GetAttribute("ToolType") then
                    for _, trigger in pairs(item:GetDescendants()) do
                        if trigger:IsA("ProximityPrompt") and trigger.Name == "DropPrompt" then
                            fireproximityprompt(trigger, trigger.MaxActivationDistance)
                        end
                    end
                end
            end
        end
    end
end)

MainLeft:AddToggle("InstantItem", { Text = "Instant Collect Items", Default = false })
task.spawn(function()
    while task.wait(1) do
        if Toggles.InstantItem and Toggles.InstantItem.Value then
            getItems()
        end
    end
end)

MainLeft:AddButton({ Text = "Collect All Items", Func = getItems })

-- Utilities Right
MainRight:AddButton({
    Text = "FullBright",
    Func = function()
        Lighting.Brightness = 2
        Lighting.ClockTime = 14
        Lighting.FogEnd = 100000
        Lighting.GlobalShadows = false
        Lighting.OutdoorAmbient = Color3.fromRGB(128, 128, 128)
    end
})

getgenv().zone = false
MainRight:AddButton({
    Text = "Safe Zone",
    Func = function()
        local rootPart = char:FindFirstChild("HumanoidRootPart")
        if not rootPart then return end
        local safeZone = workspace:FindFirstChild("SafeZone")
        if not safeZone then
            safeZone = Instance.new("Part", workspace)
            safeZone.Name = "SafeZone"; safeZone.Size = Vector3.new(50, 1, 50)
            safeZone.Transparency = 0.5; safeZone.Color = Color3.fromRGB(0, 255, 0)
            safeZone.Anchored = true; safeZone.Position = Vector3.new(0, 500, 0)
        end
        if not getgenv().zone then
            lastPos = rootPart.CFrame
            rootPart.CFrame = safeZone.CFrame + Vector3.new(0, 5, 0)
            getgenv().zone = true
        else
            if lastPos then rootPart.CFrame = lastPos end
            getgenv().zone = false
        end
    end
})

MainRight:AddButton({
    Text = "Visible Landmines",
    Func = function()
        local mf = workspace:FindFirstChild("Minefield")
        if mf then
            for _, part in pairs(mf:GetChildren()) do
                if part.Name == "Landmine" then part.Transparency = 0 end
            end
        end
    end
})

-- SECCIÓN ESP
local EspLeft = Tabs.Esp:AddLeftGroupbox("ESP Settings")

EspLeft:AddToggle("ItemESP", { Text = "Items ESP", Default = false }):OnChanged(function()
    if Toggles.ItemESP.Value then
        for _, item in pairs(workspace:GetChildren()) do createESP(item) end
    else
        clearESP()
    end
end)

EspLeft:AddToggle("PlayerESP", { Text = "Players ESP", Default = false }):OnChanged(function()
    if not Toggles.PlayerESP.Value then
        clearPlayerESP()
        if _G.playerESPUpdate then _G.playerESPUpdate:Disconnect(); _G.playerESPUpdate = nil end
    else
        for _, player in pairs(players:GetPlayers()) do
            if player ~= plr then createPlayerESP(player) end
        end
        _G.playerESPUpdate = RunService.Heartbeat:Connect(function()
            for _, player in pairs(players:GetPlayers()) do
                if player ~= plr and player.Character then
                    local folder = player.Character:FindFirstChild("PlayerESP_Folder")
                    if folder then
                        local text = folder:FindFirstChild("NameESP") and folder.NameESP:FindFirstChild("TextLabel")
                        local h = player.Character:FindFirstChildWhichIsA("Humanoid")
                        if text and h then
                            text.Text = player.Name .. " : " .. math.floor(h.Health)
                            if player:GetAttribute("Ghost") then text.TextColor3 = Color3.fromRGB(0, 255, 255) end
                        end
                    end
                end
            end
        end)
    end
end)

-- SECCIÓN MISC
local MiscLeft = Tabs.Misc:AddLeftGroupbox("Misc Character")

MiscLeft:AddToggle("RmvHitCooldown", { Text = "Remove Hit Cooldown", Default = false }):OnChanged(function()
    hum:GetAttributeChangedSignal("HitCooldown"):Connect(function()
        if Toggles.RmvHitCooldown.Value then hum:SetAttribute("HitCooldown", false) end
    end)
end)

MiscLeft:AddToggle("InfJump", { Text = "Infinite Jump", Default = false })
UserInputService.JumpRequest:Connect(function()
    if Toggles.InfJump and Toggles.InfJump.Value then
        hum:ChangeState(Enum.HumanoidStateType.Jumping)
    end
end)

MiscLeft:AddButton({ Text = "Inf Stamina", Func = function() hum:SetAttribute("MaxStamina", 9e9) hum:SetAttribute("Stamina", 9e9) end })
MiscLeft:AddButton({ Text = "Inf Inventory Size", Func = function() hum:SetAttribute("InventorySize", 9e9) end })

-- // EVENTOS DE MUNDO
workspace.ChildAdded:Connect(function(obj)
    if Toggles.ItemESP and Toggles.ItemESP.Value then createESP(obj) end
end)
local AutoGroup = Tabs.Main:AddLeftGroupbox("Autos")

AutoGroup:AddToggle("AutoCarry", {
    Text = "Auto Carry Downed",
    Default = false,
    Tooltip = "Carga automáticamente a jugadores derribados cercanos"
})

local downedFolder = workspace:WaitForChild("DownedCharacters")

-- Configuración interna
local RANGE = 7 
local IGNORE_TIME = 5 
local lastCarryTime = 0
local ignoredPlayers = {} 
local lastTarget = nil 

local function getCarryRemote()
    local char = plr.Character
    local state = char and char:FindFirstChild("StateHandler")
    return state and state:FindFirstChild("CarryAnotherPlayer")
end

-- // DETECCIÓN DE SOLTADO (Para evitar bucle al revivir)
task.spawn(function()
    while true do
        local char = plr.Character
        local hum = char and char:FindFirstChildWhichIsA("Humanoid")
        
        if hum then
            -- Escucha cuando dejas de cargar a alguien
            hum:GetAttributeChangedSignal("Carrying"):Connect(function()
                local isCarrying = hum:GetAttribute("Carrying")
                if not isCarrying and lastTarget then
                    ignoredPlayers[lastTarget] = tick() + IGNORE_TIME
                    lastTarget = nil
                end
            end)
            hum.Died:Wait()
        end
        task.wait(1)
    end
end)

-- // BUCLE PRINCIPAL (Hace caso al Toggle de Obsidian)
task.spawn(function()
    while true do
        task.wait(0.3)
        
        -- Solo ejecuta si el Toggle "AutoCarry" existe y está encendido
        if Toggles and Toggles.AutoCarry and Toggles.AutoCarry.Value then
            local myChar = plr.Character
            local myHum = myChar and myChar:FindFirstChildWhichIsA("Humanoid")
            local remote = getCarryRemote()

            if myChar and myHum and remote and not myHum:GetAttribute("Carrying") then
                local myRoot = myChar:FindFirstChild("HumanoidRootPart")
                
                if myRoot then
                    local target = nil
                    local distMin = RANGE

                    for _, victim in pairs(downedFolder:GetChildren()) do
                        -- Filtro de ignorados (Sin usar continue)
                        local isIgnored = ignoredPlayers[victim] and tick() < ignoredPlayers[victim]
                        
                        if not isIgnored then
                            local vRoot = victim:FindFirstChild("HumanoidRootPart")
                            local vHum = victim:FindFirstChildWhichIsA("Humanoid")
                            
                            if vRoot and vHum and victim ~= myChar then
                                local mag = (myRoot.Position - vRoot.Position).Magnitude
                                
                                -- Verifica rango y que no esté siendo cargado por otro
                                if mag < distMin and not vHum:GetAttribute("Carried") then
                                    target = victim
                                    distMin = mag
                                end
                            end
                        end
                    end

                    -- Ejecución
                    if target and (tick() - lastCarryTime) > 1.2 then
                        lastTarget = target
                        
                        -- Mirar al objetivo para validación
                        local targetPos = target.HumanoidRootPart.Position
                        myRoot.CFrame = CFrame.new(myRoot.Position, Vector3.new(targetPos.X, myRoot.Position.Y, targetPos.Z))
                        
                        task.wait(0.05)
                        remote:FireServer(target)
                        lastCarryTime = tick()
                    end
                end
            end
        end
    end
end)
-- // UI SETTINGS
ThemeManager:SetLibrary(Library)
SaveManager:SetLibrary(Library)
ThemeManager:SetFolder("BaconHack")
SaveManager:SetFolder("BaconHack/TheButton")
SaveManager:BuildConfigSection(Tabs["UI Settings"])
ThemeManager:ApplyToTab(Tabs["UI Settings"])

local MenuGroup = Tabs["UI Settings"]:AddLeftGroupbox("Menu")
MenuGroup:AddLabel("Menu Keybind"):AddKeyPicker("MenuKeybind", { Default = "V", NoUI = true, Text = "Menu keybind" })
Library.ToggleKeybind = Options.MenuKeybind

SaveManager:LoadAutoloadConfig()
Library:Notify("The Button Loaded!", 5)
